const UNITS = [
  { seconds: 24 * 60 * 60, name: "day" },
  { seconds: 60 * 60, name: "hour" },
  { seconds: 60, name: "minute" },
] as const;

/** "1 hour", "7 days", "15 minutes": the largest unit that divides the duration. */
export function formatDuration(totalSeconds: number): string {
  for (const unit of UNITS) {
    if (totalSeconds >= unit.seconds && totalSeconds % unit.seconds === 0) {
      const count = totalSeconds / unit.seconds;
      return `${count} ${unit.name}${count === 1 ? "" : "s"}`;
    }
  }
  return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
}
