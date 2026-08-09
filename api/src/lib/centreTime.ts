import { DateTime } from "luxon";

export const CENTRE_TIMEZONE =
  process.env.CENTRE_TIMEZONE || "America/New_York";
export const OPENING_HOUR = 7;
export const CLOSING_HOUR = 21;
const CLOSED_WEEKDAY = 7; 

export function toCentreLocal(instant: Date): DateTime {
  return DateTime.fromJSDate(instant, { zone: "utc" }).setZone(CENTRE_TIMEZONE);
}

export function fitsOpeningHours(startsAt: Date, endsAt: Date): boolean {
  const start = toCentreLocal(startsAt);
  const end = toCentreLocal(endsAt);

  if (start.weekday === CLOSED_WEEKDAY) return false;
  if (start.toISODate() !== end.toISODate()) return false;

  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  return (
    startMinutes >= OPENING_HOUR * 60 &&
    endMinutes <= CLOSING_HOUR * 60 &&
    endMinutes > startMinutes
  );
}

export function centreLocalDayBounds(centreLocalDate: string): {
  startUtc: Date;
  endUtc: Date;
} {
  const start = DateTime.fromISO(centreLocalDate, {
    zone: CENTRE_TIMEZONE,
  }).startOf("day");
  const end = start.plus({ days: 1 });
  return { startUtc: start.toUTC().toJSDate(), endUtc: end.toUTC().toJSDate() };
}
