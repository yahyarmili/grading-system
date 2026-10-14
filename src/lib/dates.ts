import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import { offsetLabel } from "./time-zone";

// Every date of the screens, in the single time zone (NFR-USA-02), named
// explicitly where a time is shown. Server and client format alike.

/** "Casablanca time": the zone's city, as people say it. */
export const TIME_ZONE_NAME = `${DEADLINE_TIME_ZONE.split("/").pop()!.replace(/_/g, " ")} time`;

const dateFormat = new Intl.DateTimeFormat("en", {
  timeZone: DEADLINE_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en", {
  timeZone: DEADLINE_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

/** "Oct 20, 2026". */
export function formatDate(value: string | Date): string {
  return dateFormat.format(toDate(value));
}

/**
 * "Oct 20, 2026, 18:00 (Casablanca time, GMT+0)": the zone is written. In a
 * table whose column header names the zone, `{ zone: false }` leaves it out.
 */
export function formatDateTime(value: string | Date, { zone = true }: { zone?: boolean } = {}): string {
  const date = toDate(value);
  const text = dateTimeFormat.format(date);
  return zone ? `${text} (${TIME_ZONE_NAME}, ${offsetLabel(date, DEADLINE_TIME_ZONE)})` : text;
}
