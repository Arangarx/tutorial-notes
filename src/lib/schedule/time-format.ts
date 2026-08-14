/** Format 24h HH:MM to locale display (e.g. "4:00 PM"). */
export function formatTimeDisplay(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return hhmm;
  const d = new Date(2000, 0, 1, hours, minutes);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function durationLabelForMinutes(minutes: number): string {
  return `~${minutes} min (soft)`;
}
