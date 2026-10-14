// Wall time in an IANA time zone <-> instant, with Intl only (no dependency).
// A wall time is what a datetime-local input gives: "YYYY-MM-DDTHH:mm".

const HOUR = 60 * 60 * 1000;
const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** The wall time of an instant in the zone, to the minute. */
export function instantToWallTime(instant: Date, zone: string): string {
  const parts = Object.fromEntries(partsFormatter(zone).formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A well-formed wall time of the calendar, whatever the zone: not 2026-02-30 nor 24:00. */
export function isWallTime(wall: string): boolean {
  const match = WALL_TIME.exec(wall);
  if (!match) return false;
  const [, y, mo, d, h, mi] = match.map(Number);
  // Date.UTC rolls 2026-02-30 over to March: the round trip catches it.
  return new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString().slice(0, 16) === wall;
}

/** Offset of the zone at an instant, in milliseconds (local minus UTC). */
function offsetAt(ms: number, zone: string): number {
  const wall = instantToWallTime(new Date(ms), zone);
  const [, y, mo, d, h, mi] = WALL_TIME.exec(wall)!.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - Math.floor(ms / 60_000) * 60_000;
}

/**
 * The instant a wall time designates in the zone, or null when it is not a
 * valid wall time or does not exist there (skipped by a change of offset).
 * When it occurs twice (offset moved back), the first occurrence.
 */
export function wallTimeToInstant(wall: string, zone: string): Date | null {
  if (!isWallTime(wall)) return null;
  const [, y, mo, d, h, mi] = WALL_TIME.exec(wall)!.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);

  // The offsets around that time; a change of offset is never closer than a day to another.
  const offsets = new Set([offsetAt(asUtc - 24 * HOUR, zone), offsetAt(asUtc, zone), offsetAt(asUtc + 24 * HOUR, zone)]);
  const matches = [...offsets]
    .map((offset) => asUtc - offset)
    .filter((ms) => instantToWallTime(new Date(ms), zone) === wall)
    .sort((a, b) => a - b);
  return matches.length > 0 ? new Date(matches[0]) : null;
}

/** "GMT+1", "GMT+0": the zone's offset at an instant, as people read it. */
export function offsetLabel(instant: Date, zone: string): string {
  const part = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName");
  // Intl writes "GMT" alone for a zero offset.
  return part?.value === "GMT" ? "GMT+0" : (part?.value ?? "");
}
