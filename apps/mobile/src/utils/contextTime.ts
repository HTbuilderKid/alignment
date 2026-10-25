let sequence = 0;
export function commandKey(): string {
  return `local-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`;
}
export function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
/** An explicit offset prevents ambiguity when entering retrospective times across DST. */
export function timeInput(instant: number): string {
  const date = new Date(instant);
  const offset = -date.getTimezoneOffset();
  const local = new Date(instant + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset >= 0 ? "+" : "-";
  return `${local}${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}
export function parseTimeInput(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(
      "Enter a date and time with its offset, for example 2026-10-25T19:30:00-04:00.",
    );
  }
  const result = Date.parse(value);
  if (!Number.isFinite(result))
    throw new Error("That date and time could not be read.");
  const suffix = value.slice(19);
  const offset =
    suffix === "Z"
      ? 0
      : (suffix[0] === "+" ? 1 : -1) *
        (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(4)));
  if (
    new Date(result + offset * 60_000).toISOString().slice(0, 19) !==
    value.slice(0, 19)
  )
    throw new Error("That calendar date does not exist.");
  return result;
}
export function minutesFromNow(value: string, now: number): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10080)
    throw new Error(
      "Choose a checkpoint between 1 minute and 7 days from now.",
    );
  return now + Math.round(minutes * 60_000);
}
