import { describe, expect, it } from "vitest";
import { instantToWallTime, offsetLabel, wallTimeToInstant } from "./time-zone";

// Casablanca's offsets follow the tz database shipped with Node (2026c at
// E3): +01 with a return to +00 during Ramadan, then +00 from 2026-09-20.
// Paris gives a stable second case for skipped and repeated hours.
const CASA = "Africa/Casablanca";
const PARIS = "Europe/Paris";

describe("wallTimeToInstant", () => {
  it("reads a wall time in the zone's offset of that day", () => {
    expect(wallTimeToInstant("2026-07-01T18:00", CASA)?.toISOString()).toBe("2026-07-01T17:00:00.000Z");
    expect(wallTimeToInstant("2026-03-01T18:00", CASA)?.toISOString()).toBe("2026-03-01T18:00:00.000Z");
    expect(wallTimeToInstant("2026-10-20T18:00", CASA)?.toISOString()).toBe("2026-10-20T18:00:00.000Z");
    expect(wallTimeToInstant("2026-07-01T18:00", PARIS)?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });

  it("refuses a time skipped by a change of offset", () => {
    expect(wallTimeToInstant("2026-03-22T02:30", CASA)).toBeNull();
    expect(wallTimeToInstant("2026-03-29T02:30", PARIS)).toBeNull();
  });

  it("takes the first occurrence of a repeated time", () => {
    expect(wallTimeToInstant("2026-09-20T01:30", CASA)?.toISOString()).toBe("2026-09-20T00:30:00.000Z");
    expect(wallTimeToInstant("2026-10-25T02:30", PARIS)?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it.each(["", "2026-10-20", "2026-10-20 18:00", "2026-02-30T10:00", "2026-10-20T24:00", "2026-13-01T10:00", "x"])(
    "refuses %j",
    (wall) => expect(wallTimeToInstant(wall, CASA)).toBeNull(),
  );

  it("gives back the same wall time", () => {
    for (const wall of ["2026-01-01T00:00", "2026-06-15T23:59", "2027-12-31T12:30"]) {
      expect(instantToWallTime(wallTimeToInstant(wall, CASA)!, CASA)).toBe(wall);
    }
  });
});

describe("offsetLabel", () => {
  it("writes the offset, zero included", () => {
    expect(offsetLabel(new Date("2026-07-01T12:00Z"), CASA)).toBe("GMT+1");
    expect(offsetLabel(new Date("2026-10-20T12:00Z"), CASA)).toBe("GMT+0");
  });
});
