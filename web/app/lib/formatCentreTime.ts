import { DateTime } from "luxon";

export const CENTRE_TIMEZONE =
  process.env.NEXT_PUBLIC_CENTRE_TIMEZONE || "America/New_York";

export function formatCentreDateTime(iso: string): string {
  return (
    DateTime.fromISO(iso, { zone: "utc" })
      .setZone(CENTRE_TIMEZONE)
      .toFormat("dd/LL/yyyy, h:mm a") + " ET"
  );
}
