import { describe, expect, it } from "vitest";
import {
  parseCard,
  parseCardTime,
  resolvePunchTimes,
  type OcrWord,
} from "@/modules/attendance/card-layout";

/**
 * Synthetic OCR output modelled on a photographed Model 9000 card at 2000×3400 px:
 * day numbers in a column at x≈170, rows 144 px apart starting at y=1260, and punch
 * columns (Morning In/Out, Afternoon In/Out, Overtime In/Out) at x≈430…1740.
 */
const IMG = { width: 2000, height: 3400 };
const ROW0 = 1260;
const PITCH = 144;
const COLS = [430, 690, 950, 1210, 1470, 1740];

const rowY = (day: number) => ROW0 + (day - 1) * PITCH;

function word(text: string, cx: number, cy: number, confidence = 96): OcrWord {
  const w = text.length * 34;
  return { text, confidence, x0: cx - w / 2, y0: cy - 20, x1: cx + w / 2, y1: cy + 20 };
}

const anchor = (day: number, confidence = 96) => word(String(day), 170, rowY(day), confidence);
const punch = (day: number, col: number, text: string, confidence = 96, dy = 0) =>
  word(text, COLS[col]!, rowY(day) + dy, confidence);

describe("parseCardTime", () => {
  it("reads 3- and 4-digit prints and colon forms", () => {
    expect(parseCardTime("758")).toEqual({ h: 7, m: 58 });
    expect(parseCardTime("1203")).toEqual({ h: 12, m: 3 });
    expect(parseCardTime("12:03")).toEqual({ h: 12, m: 3 });
    expect(parseCardTime("100")).toEqual({ h: 1, m: 0 });
  });
  it("rejects day numbers, years and phone numbers", () => {
    expect(parseCardTime("7")).toBeNull();
    expect(parseCardTime("15")).toBeNull();
    expect(parseCardTime("9000")).toBeNull();
    expect(parseCardTime("2099")).toBeNull();
    expect(parseCardTime("13:70")).toBeNull();
  });
});

describe("resolvePunchTimes", () => {
  const r = (...t: string[]) => resolvePunchTimes(t.map((s) => parseCardTime(s)!));
  it("makes a full day chronological", () => {
    expect(r("758", "1203", "1258", "502").minutes).toEqual([478, 723, 778, 1022]);
  });
  it("handles morning only, afternoon only and OT columns", () => {
    expect(r("758", "1200").minutes).toEqual([478, 720]);
    expect(r("1258", "502").minutes).toEqual([778, 1022]);
    expect(r("100", "500").minutes).toEqual([780, 1020]);
    expect(r("803", "1202", "101", "500", "530", "805").minutes).toEqual([
      483, 722, 781, 1020, 1050, 1205,
    ]);
  });
  it("keeps 24-hour prints as they are", () => {
    expect(r("0758", "1730").minutes).toEqual([478, 1050]);
  });
  it("flags a row whose readings cannot be ordered", () => {
    const out = r("1730", "1230");
    expect(out.inOrder).toBe(false);
  });
});

describe("parseCard", () => {
  it("maps punches to days through the day column and resolves AM/PM", () => {
    const words: OcrWord[] = [
      // header noise: the "20__" year blank and a model number
      word("20", 1500, 300),
      word("9000", 400, 3300, 0),
      // OCR usually misses isolated single digits; 1 and 10–15 are enough anchors
      anchor(1),
      ...[10, 11, 12, 13, 14, 15].map((d) => anchor(d)),
      punch(1, 0, "758"),
      punch(1, 1, "1203"),
      punch(1, 2, "1258"),
      punch(1, 3, "502"),
      punch(3, 0, "7:55"),
      punch(3, 1, "12:05"),
      punch(3, 2, "12:59"),
      punch(3, 3, "6:30"),
      punch(5, 0, "758", 96, 8),
      punch(5, 1, "1200", 96, -6),
      punch(6, 0, "803"),
      punch(6, 1, "1202"),
      punch(6, 2, "101"),
      punch(6, 3, "500"),
      punch(6, 4, "530"),
      punch(6, 5, "805"),
      punch(9, 4, "800"),
      punch(9, 5, "1200"),
      punch(15, 0, "800"),
      punch(15, 1, "1200"),
      punch(15, 2, "100"),
      punch(15, 3, "500"),
    ];
    const out = parseCard(words, IMG, { firstDay: 1, lastDay: 15 });
    expect(out.ok).toBe(true);
    expect(out.warnings).toEqual([]);
    expect(out.anchors.map((a) => a.day)).toEqual([1, 10, 11, 12, 13, 14, 15]);
    expect(out.rowPitch).toBeCloseTo(PITCH, 3);
    expect(out.days).toHaveLength(15);

    const day = (d: number) => out.days.find((x) => x.day === d)!;
    expect(day(1).timeIn).toBe("07:58");
    expect(day(1).timeOut).toBe("17:02");
    expect(day(1).punches.map((p) => p.time)).toEqual(["07:58", "12:03", "12:58", "17:02"]);
    expect(day(1).notes).toEqual([]);
    expect(day(3).timeIn).toBe("07:55");
    expect(day(3).timeOut).toBe("18:30");
    expect(day(5).timeIn).toBe("07:58");
    expect(day(5).timeOut).toBe("12:00");
    expect(day(6).timeOut).toBe("20:05");
    expect(day(9).timeIn).toBe("08:00");
    expect(day(9).timeOut).toBe("12:00");
    expect(day(15).timeOut).toBe("17:00");
    expect(day(2).punches).toEqual([]);
    expect(day(2).timeIn).toBeNull();

    // header digits are not treated as punches or anchors
    expect(out.words.filter((w) => w.kind === "ignored").map((w) => w.text)).toContain("20");
    expect(out.words.filter((w) => w.kind === "time")).toHaveLength(22);
  });

  it("joins a punch the OCR split at the gap (7 58)", () => {
    const words: OcrWord[] = [
      anchor(1),
      anchor(15),
      { ...word("7", 400, rowY(2)), x1: 400 + 17 },
      { ...word("58", 460, rowY(2)), x0: 460 - 34 },
      punch(2, 1, "1201"),
    ];
    const out = parseCard(words, IMG, { firstDay: 1, lastDay: 15 });
    const d2 = out.days.find((d) => d.day === 2)!;
    expect(d2.punches.map((p) => p.text)).toEqual(["758", "1201"]);
    expect(d2.timeIn).toBe("07:58");
  });

  it("flags days that need checking", () => {
    const words: OcrWord[] = [
      anchor(1),
      anchor(15),
      punch(2, 0, "758", 55),
      punch(2, 1, "1201"),
      punch(4, 0, "801"),
      punch(4, 1, "1200"),
      punch(4, 2, "100"),
      punch(7, 0, "802", 96, 60),
      punch(7, 1, "500"),
    ];
    const out = parseCard(words, IMG, { firstDay: 1, lastDay: 15 });
    const day = (d: number) => out.days.find((x) => x.day === d)!;
    expect(day(2).notes).toEqual(["low OCR confidence"]);
    expect(day(2).confidence).toBe(55);
    expect(day(4).notes).toEqual(["odd number of punches"]);
    expect(day(4).timeIn).toBe("08:01");
    expect(day(4).timeOut).toBe("13:00");
    expect(day(7).notes).toEqual(["sits between rows"]);
  });

  it("uses the printed day numbers, so the 16–31 side maps onto the second cutoff", () => {
    const words: OcrWord[] = [
      // back of the card: rows print 16..31 in the same positions as 1..16
      ...[16, 20, 25, 31].map((d) => word(String(d), 170, rowY(d - 15))),
      word("758", COLS[0]!, rowY(17 - 15)),
      word("502", COLS[3]!, rowY(17 - 15)),
      word("800", COLS[0]!, rowY(31 - 15)),
      word("1200", COLS[1]!, rowY(31 - 15)),
    ];
    const out = parseCard(words, IMG, { firstDay: 16, lastDay: 31 });
    expect(out.ok).toBe(true);
    expect(out.days.map((d) => d.day)).toEqual(Array.from({ length: 16 }, (_, i) => 16 + i));
    expect(out.days.find((d) => d.day === 17)!.timeIn).toBe("07:58");
    expect(out.days.find((d) => d.day === 17)!.timeOut).toBe("17:02");
    expect(out.days.find((d) => d.day === 31)!.timeOut).toBe("12:00");
  });

  it("warns when the scanned side does not match the cutoff", () => {
    const words: OcrWord[] = [anchor(1), anchor(15), punch(3, 0, "758"), punch(3, 3, "502")];
    const out = parseCard(words, IMG, { firstDay: 16, lastDay: 31 });
    expect(out.ok).toBe(true);
    expect(out.warnings.some((w) => w.includes("day(s) 3"))).toBe(true);
    expect(out.days.every((d) => d.punches.length === 0)).toBe(true);
  });

  it("fails clearly when no day column is found", () => {
    const words: OcrWord[] = [punch(3, 0, "758"), punch(3, 3, "502"), word("20", 1500, 300)];
    const out = parseCard(words, IMG, { firstDay: 1, lastDay: 15 });
    expect(out.ok).toBe(false);
    expect(out.anchors).toEqual([]);
    expect(out.days).toHaveLength(15);
    expect(out.warnings[0]).toMatch(/day numbers/);
  });

  it("does not mistake header digits for the day column", () => {
    // two small numbers stacked in the header, far too close together to be rows
    const words: OcrWord[] = [word("2", 170, 300), word("5", 170, 320), punch(3, 0, "758")];
    const out = parseCard(words, IMG, { firstDay: 1, lastDay: 15 });
    expect(out.ok).toBe(false);
  });
});
