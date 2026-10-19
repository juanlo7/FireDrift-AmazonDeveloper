import type { Proposal } from "@firedrift/domain";
import type { TmdbListItem } from "../catalog/tmdbTypes";

/** A proposal's year may be off by this much (the model often remembers the wrong year). */
export const YEAR_TOLERANCE = 1;

/**
 * Compares titles the way people write them: case, accents, punctuation,
 * "&"/"and" and a leading article do not matter.
 */
export const normalizeTitle = (title: string): string =>
  title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");

const yearOf = (item: TmdbListItem): number | null => {
  const date = item.release_date || item.first_air_date;
  const year = date ? Number(date.slice(0, 4)) : Number.NaN;
  return Number.isInteger(year) ? year : null;
};

const titlesOf = (item: TmdbListItem) =>
  [item.title, item.name, item.original_title, item.original_name].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );

/**
 * The confident TMDB match for a proposal, or `null`. Confident means the
 * same normalized title and, when the proposal has a year, a year within
 * `YEAR_TOLERANCE`. A similar but different title is never a match: the
 * butler must not show a title the model did not mean.
 */
export const pickConfidentMatch = (proposal: Proposal, results: TmdbListItem[]): TmdbListItem | null => {
  const wanted = normalizeTitle(proposal.title);
  if (!wanted) return null;
  const matches = results.filter((item) => {
    if (!titlesOf(item).some((t) => normalizeTitle(t) === wanted)) return false;
    if (proposal.year === null) return true;
    const year = yearOf(item);
    return year !== null && Math.abs(year - proposal.year) <= YEAR_TOLERANCE;
  });
  if (matches.length === 0) return null;
  // Remakes and namesakes share a title: prefer the exact year, then the best-known one.
  const yearGap = (item: TmdbListItem) =>
    proposal.year === null ? 0 : Math.abs((yearOf(item) ?? proposal.year) - proposal.year);
  return [...matches].sort((a, b) => yearGap(a) - yearGap(b) || b.vote_count - a.vote_count)[0]!;
};
