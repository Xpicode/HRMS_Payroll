import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { parseCard } from "@/modules/attendance/card-layout";
import { preprocessCard, recognizeCard } from "@/modules/attendance/ocr";

/**
 * End-to-end: render a card in the Ideaworks Model 9000 layout (days 1–15, Morning /
 * Afternoon / Overtime In-Out), photograph-like JPEG, run the real OCR engine, parse.
 * Slower than the other tests (engine start + ~1 s recognition).
 */

const PUNCHES: Record<number, string[]> = {
  1: ["758", "1203", "1258", "502", "", ""],
  2: ["801", "1201", "100", "517", "", ""],
  3: ["7:55", "12:05", "12:59", "6:30", "", ""],
  4: ["802", "", "1259", "505", "", ""],
  5: ["758", "1200", "", "", "", ""],
  6: ["803", "1202", "101", "500", "530", "805"],
  8: ["759", "1201", "1257", "503", "", ""],
  9: ["", "", "", "", "800", "1200"],
  15: ["800", "1200", "100", "500", "", ""],
};

async function renderCard(): Promise<Buffer> {
  const W = 1000;
  const H = 1800;
  const top = 640;
  const pitch = 72;
  const cols = [190, 320, 450, 580, 710, 840];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f2efe6"/>`;
  const text = (x: number, y: number, size: number, s: string, extra = "") =>
    `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" ${extra}>${s}</text>`;
  svg += text(60, 120, 30, "No. ________  Pay Ending ____________ 20__", 'font-weight="bold"');
  svg += text(60, 190, 30, "NAME ______________________ Position ______", 'font-weight="bold"');
  svg += text(60, 260, 30, "Dept. ______________________ Age ______", 'font-weight="bold"');
  svg += text(60, 330, 22, "Hours   Rate   Amount    ABSENCES  Fines  Withholding Tax  S.S.S.");
  svg += text(
    60,
    top - 90,
    24,
    "Days      MORNING           AFTERNOON          OVERTIME        Daily",
  );
  svg += text(
    60,
    top - 55,
    22,
    "            IN       OUT       IN       OUT       IN      OUT     Total",
  );
  for (let d = 1; d <= 15; d++) {
    const r = d - 1;
    const y = top + r * pitch;
    svg += `<line x1="50" y1="${y + 18}" x2="${W - 50}" y2="${y + 18}" stroke="#777" stroke-width="2"/>`;
    svg += text(70, y, 26, String(d), 'fill="#111"');
    (PUNCHES[d] ?? []).forEach((t, c) => {
      if (!t) return;
      const jitter = ((r * 7 + c * 3) % 9) - 4;
      svg += `<text x="${cols[c]! + jitter}" y="${y + jitter}" font-family="Courier New, monospace" font-weight="bold" font-size="30" fill="${c % 2 ? "#1a2a9a" : "#a01010"}">${t}</text>`;
    });
  }
  svg += text(60, H - 120, 22, "I hereby certify that the above records are true and correct.");
  svg += text(
    60,
    H - 60,
    22,
    "MODEL-9000 IDEAWORKS          EMPLOYEE'S SIGNATURE",
    'font-weight="bold"',
  );
  svg += `</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

describe("card OCR (tesseract in-process)", () => {
  it("rejects files that are not images", async () => {
    await expect(preprocessCard(Buffer.from("employee_no,date\n"))).rejects.toThrow(
      /not a readable image/,
    );
  });

  it("reads a rendered Model 9000 card into per-day punches", async () => {
    const jpeg = await renderCard();
    const ocr = await recognizeCard(jpeg);
    expect(ocr.width).toBeGreaterThan(1000);
    const out = parseCard(ocr.words, ocr, { firstDay: 1, lastDay: 15 });
    expect(out.ok).toBe(true);
    expect(out.anchors.length).toBeGreaterThanOrEqual(3);

    const day = (d: number) => out.days.find((x) => x.day === d)!;
    expect(day(1).punches.map((p) => p.time)).toEqual(["07:58", "12:03", "12:58", "17:02"]);
    expect([day(2).timeIn, day(2).timeOut]).toEqual(["08:01", "17:17"]);
    expect([day(3).timeIn, day(3).timeOut]).toEqual(["07:55", "18:30"]);
    expect([day(4).timeIn, day(4).timeOut]).toEqual(["08:02", "17:05"]);
    expect(day(4).notes).toContain("odd number of punches");
    expect([day(5).timeIn, day(5).timeOut]).toEqual(["07:58", "12:00"]);
    expect([day(6).timeIn, day(6).timeOut]).toEqual(["08:03", "20:05"]);
    expect(day(7).punches).toEqual([]);
    expect([day(8).timeIn, day(8).timeOut]).toEqual(["07:59", "17:03"]);
    expect([day(9).timeIn, day(9).timeOut]).toEqual(["08:00", "12:00"]);
    expect([day(15).timeIn, day(15).timeOut]).toEqual(["08:00", "17:00"]);
    expect(out.days.filter((d) => d.punches.length).map((d) => d.day)).toEqual([
      1, 2, 3, 4, 5, 6, 8, 9, 15,
    ]);
  }, 90_000);
});
