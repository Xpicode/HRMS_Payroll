/**
 * Pure layout parser for photographed bundy cards (e.g. Ideaworks Model 9000):
 * a "Days" column of printed day numbers on the left and punch times printed by the
 * clock in In/Out columns to the right. Input is the OCR word list (digits and colons
 * only); output is one entry per day of the cutoff with the first and last punch.
 *
 * No Prisma, no Date.now(), no image access — the OCR step lives in ocr.ts.
 */

export type OcrWord = {
  text: string;
  /** 0–100 */
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type CardWordKind = "anchor" | "time" | "ignored";

export type CardWord = OcrWord & { kind: CardWordKind; day: number | null };

export type CardPunch = {
  /** As printed, e.g. "758" or "12:03". */
  text: string;
  /** Resolved 24-hour "HH:MM". */
  time: string;
  confidence: number;
};

export type CardDay = {
  day: number;
  punches: CardPunch[];
  timeIn: string | null;
  timeOut: string | null;
  /** Lowest punch confidence (100 when the day has no punches). */
  confidence: number;
  /** Reasons the encoder should look at this day. */
  notes: string[];
};

export type CardParse = {
  /** true when the day column was found and rows could be mapped. */
  ok: boolean;
  days: CardDay[];
  words: CardWord[];
  anchors: { day: number; y: number }[];
  rowPitch: number | null;
  warnings: string[];
};

export type CardParseOptions = {
  /** Day-of-month range of the cutoff, e.g. 16..31. */
  firstDay: number;
  lastDay: number;
};

/** Words below this confidence are noise (OCR gives 0 for shapes it cannot read). */
const MIN_WORD_CONFIDENCE = 20;
const MIN_ANCHOR_CONFIDENCE = 40;
/** A punch below this, or a row that sits between two day rows, marks the day "check". */
const CHECK_CONFIDENCE = 70;
const CHECK_RESIDUAL = 0.35;
/** Inlier tolerance for the day-column line fit, in rows. */
const INLIER_RESIDUAL = 0.3;
/** Anchors must share a column: this wide, as a fraction of the image width. */
const COLUMN_TOLERANCE = 0.05;
/** Plausible row pitch as a fraction of the image height (15–31 rows on a card). */
const MIN_PITCH = 0.012;
const MAX_PITCH = 0.12;
/** Punches per day on a six-column card. */
const MAX_PUNCHES = 6;

type Token = OcrWord & { cx: number; cy: number; h: number; merged: boolean };

const TIME_RE = /^(\d{1,2}):?(\d{2})$/;

/** "758" -> {h:7,m:58}; "12:03" -> {h:12,m:3}; null when not a plausible clock time. */
export function parseCardTime(text: string): { h: number; m: number } | null {
  const s = text.replace(/:/g, "");
  if (!/^\d{3,4}$/.test(s)) return null;
  const m = Number(s.slice(-2));
  const h = Number(s.slice(0, -2));
  if (h > 23 || m > 59) return null;
  return { h, m };
}

const isTimeText = (text: string) => TIME_RE.test(text) && parseCardTime(text) !== null;

function toToken(w: OcrWord): Token {
  return {
    ...w,
    cx: (w.x0 + w.x1) / 2,
    cy: (w.y0 + w.y1) / 2,
    h: Math.max(1, w.y1 - w.y0),
    merged: false,
  };
}

function cleanText(text: string): string {
  return text.trim().replace(/^:+|:+$/g, "");
}

/**
 * The clock sometimes prints "7 58" with a gap, which OCR returns as two words.
 * Join horizontally adjacent fragments when neither is a time alone and the pair is.
 */
function mergeFragments(tokens: Token[]): Token[] {
  const sorted = [...tokens].sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const out: Token[] = [];
  const used = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const a = sorted[i]!;
    let mergedTok: Token | null = null;
    for (let j = 0; j < sorted.length && !mergedTok; j++) {
      if (j === i || used.has(j)) continue;
      const b = sorted[j]!;
      const sameLine = Math.abs(a.cy - b.cy) < 0.5 * Math.max(a.h, b.h);
      const gap = b.x0 - a.x1;
      if (!sameLine || gap < -0.2 * a.h || gap > 1.0 * a.h) continue;
      if (isTimeText(a.text) || isTimeText(b.text)) continue;
      const joined = a.text + b.text;
      if (!isTimeText(joined)) continue;
      mergedTok = {
        text: joined,
        confidence: Math.min(a.confidence, b.confidence),
        x0: Math.min(a.x0, b.x0),
        y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1),
        y1: Math.max(a.y1, b.y1),
        cx: 0,
        cy: 0,
        h: 0,
        merged: true,
      };
      mergedTok = { ...toToken(mergedTok), merged: true };
      used.add(j);
    }
    used.add(i);
    out.push(mergedTok ?? a);
  }
  return out;
}

type Fit = { pitch: number; y0: number; inliers: Token[] };

/**
 * Find the printed day numbers: small integers that line up vertically at an even pitch.
 * RANSAC over anchor pairs, then a least-squares refit on the inliers. Header digits
 * ("20__", phone numbers) fail either the column or the pitch test.
 */
function fitDayColumn(cands: Token[], width: number, height: number): Fit | null {
  const val = (t: Token) => Number(t.text);
  let best: Fit | null = null;
  const colTol = COLUMN_TOLERANCE * width;
  for (const a of cands) {
    for (const b of cands) {
      if (val(b) <= val(a) || b.cy <= a.cy || Math.abs(a.cx - b.cx) > colTol) continue;
      const pitch = (b.cy - a.cy) / (val(b) - val(a));
      if (pitch < MIN_PITCH * height || pitch > MAX_PITCH * height) continue;
      const y0 = a.cy - val(a) * pitch;
      const inliers = cands.filter(
        (t) =>
          Math.abs(t.cx - a.cx) <= colTol &&
          Math.abs((t.cy - y0) / pitch - val(t)) <= INLIER_RESIDUAL,
      );
      // dedupe anchors that read the same day twice (keep the more confident one)
      const byDay = new Map<number, Token>();
      for (const t of inliers) {
        const prev = byDay.get(val(t));
        if (!prev || t.confidence > prev.confidence) byDay.set(val(t), t);
      }
      const unique = [...byDay.values()];
      if (
        !best ||
        unique.length > best.inliers.length ||
        (unique.length === best.inliers.length && a.cx < best.inliers[0]!.cx)
      ) {
        best = { pitch, y0, inliers: unique.sort((p, q) => p.cy - q.cy) };
      }
    }
  }
  if (!best || best.inliers.length < 2) return null;
  // least-squares refit: cy = pitch * day + y0
  const n = best.inliers.length;
  const xs = best.inliers.map(val);
  const ys = best.inliers.map((t) => t.cy);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const pitch = sxx > 0 ? sxy / sxx : best.pitch;
  return { pitch, y0: my - pitch * mx, inliers: best.inliers };
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Bundy clocks print 12-hour times without AM/PM. Punches on a row are chronological
 * left to right, so each one is the smallest reading that is not earlier than the
 * previous punch: 758, 1203, 1258, 502 -> 07:58, 12:03, 12:58, 17:02.
 * The first punch is morning unless it reads 1–5 o'clock (an afternoon-only row).
 */
export function resolvePunchTimes(readings: { h: number; m: number }[]): {
  minutes: number[];
  inOrder: boolean;
} {
  const minutes: number[] = [];
  let inOrder = true;
  let prev = -1;
  readings.forEach((r, i) => {
    let cands: number[];
    if (r.h >= 13) cands = [r.h * 60 + r.m];
    else if (r.h === 12) cands = [12 * 60 + r.m, r.m];
    else cands = [r.h * 60 + r.m, (r.h + 12) * 60 + r.m];
    let pick: number;
    if (i === 0) {
      pick = r.h >= 1 && r.h <= 5 ? cands[cands.length - 1]! : cands[0]!;
    } else {
      const ok = cands.filter((c) => c >= prev);
      if (ok.length) pick = ok[0]!;
      else {
        pick = cands[cands.length - 1]!;
        inOrder = false;
      }
    }
    minutes.push(pick);
    prev = pick;
  });
  return { minutes, inOrder };
}

export function parseCard(
  words: OcrWord[],
  image: { width: number; height: number },
  opts: CardParseOptions,
): CardParse {
  const warnings: string[] = [];
  const tokens = mergeFragments(
    words
      .map((w) => ({ ...w, text: cleanText(w.text) }))
      .filter((w) => w.confidence >= MIN_WORD_CONFIDENCE && /^\d+(:\d+)?$/.test(w.text))
      .map(toToken),
  );

  const anchorCands = tokens.filter(
    (t) =>
      !t.merged &&
      /^\d{1,2}$/.test(t.text) &&
      Number(t.text) >= 1 &&
      Number(t.text) <= 31 &&
      t.confidence >= MIN_ANCHOR_CONFIDENCE,
  );
  const fit = fitDayColumn(anchorCands, image.width, image.height);

  const emptyDays = (): CardDay[] => {
    const days: CardDay[] = [];
    for (let d = opts.firstDay; d <= opts.lastDay; d++)
      days.push({ day: d, punches: [], timeIn: null, timeOut: null, confidence: 100, notes: [] });
    return days;
  };

  if (!fit) {
    warnings.push(
      "The day numbers down the left of the card could not be read, so rows cannot be matched to dates. Retake the photo flat, straight and with the whole card in the frame, or type the times from the image.",
    );
    return {
      ok: false,
      days: emptyDays(),
      words: tokens.map((t) => ({ ...t, kind: "ignored", day: null })),
      anchors: [],
      rowPitch: null,
      warnings,
    };
  }

  const anchorSet = new Set(fit.inliers);
  const outWords: CardWord[] = [];
  const byDay = new Map<number, { tok: Token; residual: number }[]>();
  for (const t of tokens) {
    if (anchorSet.has(t)) {
      outWords.push({ ...t, kind: "anchor", day: Number(t.text) });
      continue;
    }
    const reading = parseCardTime(t.text);
    if (!reading || !TIME_RE.test(t.text)) {
      outWords.push({ ...t, kind: "ignored", day: null });
      continue;
    }
    const v = (t.cy - fit.y0) / fit.pitch;
    const day = Math.round(v);
    if (day < 1 || day > 31 || t.cx <= fit.inliers[0]!.cx) {
      outWords.push({ ...t, kind: "ignored", day: null });
      continue;
    }
    outWords.push({ ...t, kind: "time", day });
    byDay.set(day, [...(byDay.get(day) ?? []), { tok: t, residual: Math.abs(v - day) }]);
  }

  const days = emptyDays();
  const outside: number[] = [];
  for (const [day, list] of byDay) {
    const entry = days.find((d) => d.day === day);
    if (!entry) {
      outside.push(day);
      continue;
    }
    list.sort((a, b) => a.tok.cx - b.tok.cx);
    const readings = list.map((l) => parseCardTime(l.tok.text)!);
    const { minutes, inOrder } = resolvePunchTimes(readings);
    entry.punches = list.map((l, i) => ({
      text: l.tok.text,
      time: hhmm(minutes[i]!),
      confidence: Math.round(l.tok.confidence),
    }));
    entry.timeIn = entry.punches[0]?.time ?? null;
    entry.timeOut = entry.punches.length > 1 ? entry.punches[entry.punches.length - 1]!.time : null;
    entry.confidence = Math.min(...entry.punches.map((p) => p.confidence));
    if (entry.punches.length % 2 === 1) entry.notes.push("odd number of punches");
    if (entry.punches.length > MAX_PUNCHES) entry.notes.push("more punches than columns");
    if (!inOrder) entry.notes.push("times not in order");
    if (entry.confidence < CHECK_CONFIDENCE) entry.notes.push("low OCR confidence");
    if (list.some((l) => l.residual > CHECK_RESIDUAL)) entry.notes.push("sits between rows");
  }
  if (outside.length) {
    outside.sort((a, b) => a - b);
    warnings.push(
      `Punches were found for day(s) ${outside.join(", ")}, which are outside this cutoff and were ignored. Check that the right side of the card was scanned.`,
    );
  }
  if (byDay.size === 0) warnings.push("No punch times were found on the card.");

  return {
    ok: true,
    days,
    words: outWords,
    anchors: fit.inliers.map((t) => ({ day: Number(t.text), y: t.cy })),
    rowPitch: fit.pitch,
    warnings,
  };
}
