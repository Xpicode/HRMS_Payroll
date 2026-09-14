/**
 * Philippine national holidays for 2026.
 *
 * Source to verify against: Proclamation declaring the regular holidays and special
 * (non-working) days for 2026 (Office of the President). Islamic holidays (Eid'l Fitr,
 * Eid'l Adha) are proclaimed separately once the dates are confirmed — add them via the
 * Holidays screen. These are data rows: correct them in the UI, not in code.
 */
export type SeedHoliday = {
  date: string;
  name: string;
  type: "REGULAR" | "SPECIAL_NON_WORKING" | "SPECIAL_WORKING";
};

export const HOLIDAYS_2026: SeedHoliday[] = [
  // Regular holidays
  { date: "2026-01-01", name: "New Year's Day", type: "REGULAR" },
  { date: "2026-04-02", name: "Maundy Thursday", type: "REGULAR" },
  { date: "2026-04-03", name: "Good Friday", type: "REGULAR" },
  { date: "2026-04-09", name: "Araw ng Kagitingan", type: "REGULAR" },
  { date: "2026-05-01", name: "Labor Day", type: "REGULAR" },
  { date: "2026-06-12", name: "Independence Day", type: "REGULAR" },
  { date: "2026-08-31", name: "National Heroes Day", type: "REGULAR" },
  { date: "2026-11-30", name: "Bonifacio Day", type: "REGULAR" },
  { date: "2026-12-25", name: "Christmas Day", type: "REGULAR" },
  { date: "2026-12-30", name: "Rizal Day", type: "REGULAR" },
  // Special non-working days
  { date: "2026-02-17", name: "Chinese New Year", type: "SPECIAL_NON_WORKING" },
  {
    date: "2026-02-25",
    name: "EDSA People Power Revolution Anniversary",
    type: "SPECIAL_NON_WORKING",
  },
  { date: "2026-04-04", name: "Black Saturday", type: "SPECIAL_NON_WORKING" },
  { date: "2026-08-21", name: "Ninoy Aquino Day", type: "SPECIAL_NON_WORKING" },
  { date: "2026-11-01", name: "All Saints' Day", type: "SPECIAL_NON_WORKING" },
  { date: "2026-11-02", name: "All Souls' Day", type: "SPECIAL_NON_WORKING" },
  {
    date: "2026-12-08",
    name: "Feast of the Immaculate Conception of Mary",
    type: "SPECIAL_NON_WORKING",
  },
  { date: "2026-12-24", name: "Christmas Eve", type: "SPECIAL_NON_WORKING" },
  { date: "2026-12-31", name: "Last Day of the Year", type: "SPECIAL_NON_WORKING" },
];
