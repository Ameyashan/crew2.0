// View helpers shared by every renderer (PDF, DOCX, and both on-screen previews)
// so they can't drift apart on what a stint header should say.

import type { ResumeTrack } from "./types";

export function dateRange(start?: string, end?: string): string {
  return [start, end].filter(Boolean).join(" – ");
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export interface TrackHeader {
  title: string; // "" when it would only repeat the employer-level role
  dates: string; // "" when they would only repeat the employer-level tenure
  show: boolean; // false when the whole header row is redundant
}

// What a stint's header line should show, given the employer entry above it.
//
// An employer with one stint has already said the title and the dates on its own
// line; repeating them immediately underneath is noise. So:
//   - dates are dropped when they match the employer's tenure (or are missing),
//   - a title identical to the employer's role is dropped, and a title that
//     merely extends it ("Product Manager, Agile Product Lead") loses the
//     duplicated prefix and keeps the part that adds something.
// A multi-stint employer keeps everything: there the dates are the whole point.
export function trackHeader(
  entry: { role?: string; start?: string; end?: string },
  track: ResumeTrack,
  isOnlyTrack: boolean,
): TrackHeader {
  const dates = dateRange(track.start, track.end);
  const entryDates = dateRange(entry.start, entry.end);

  if (!isOnlyTrack) {
    return { title: track.title ?? "", dates, show: Boolean(track.title || dates) };
  }

  const keepDates = dates && norm(dates) !== norm(entryDates) ? dates : "";

  let title = (track.title ?? "").trim();
  const role = (entry.role ?? "").trim();
  if (role && norm(title) === norm(role)) {
    title = "";
  } else if (role && norm(title).startsWith(norm(role) + ", ")) {
    title = title.slice(role.length + 2).trim();
  }

  return { title, dates: keepDates, show: Boolean(title || keepDates) };
}
