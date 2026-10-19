import {
  ResolveTitlesInput,
  type DropReason,
  type Proposal,
  type ResolveTitlesOutput,
  type TitleCard,
} from "@firedrift/domain";
import type { CatalogService } from "../../catalog/catalogService";
import { toTmdbType } from "../../catalog/mapping";
import { TmdbError, type TmdbClient } from "../../catalog/tmdbClient";
import { pickConfidentMatch } from "../../grounding/match";
import { canShow, loadVisibility, type Visibility } from "../../grounding/visibility";
import type { ProfileRepository } from "../../profile/profileStore";
import { getCatalogRuntime } from "../../shared/runtime";
import { createToolHandler } from "../../shared/tool";

interface ResolveTitlesDeps {
  tmdb: TmdbClient;
  catalog: CatalogService;
  profiles: ProfileRepository;
}

type Resolution = { card: TitleCard } | { reason: DropReason };

/** Searches with the year first; if the model got the year wrong, searches without it. */
const findMatch = async (tmdb: TmdbClient, proposal: Proposal) => {
  const type = toTmdbType(proposal.type);
  const withYear = await tmdb.search(type, proposal.title, proposal.year ?? undefined);
  const match = pickConfidentMatch(proposal, withYear.results);
  if (match || proposal.year === null) return match;
  const anyYear = await tmdb.search(type, proposal.title);
  return pickConfidentMatch(proposal, anyYear.results);
};

const resolve = async (
  { tmdb, catalog }: ResolveTitlesDeps,
  proposal: Proposal,
  visibility: Visibility,
): Promise<Resolution> => {
  const match = await findMatch(tmdb, proposal);
  if (!match) return { reason: "no_match" };
  try {
    const card = await catalog.getTitleCard(proposal.type, match.id, visibility.country, visibility.services);
    return canShow(card, visibility) ? { card } : { reason: "not_on_my_services" };
  } catch (cause) {
    if (cause instanceof TmdbError && cause.status === 404) return { reason: "no_match" };
    throw cause;
  }
};

/**
 * The Gateway schema cannot mark an integer as nullable, so `year` may be
 * left out; the contract's `null` ("unsure") is filled in before validation.
 */
const withNullYears = (input: unknown): unknown => {
  const event = typeof input === "string" ? safeJson(input) : input;
  if (!event || typeof event !== "object" || !Array.isArray((event as { proposals?: unknown }).proposals)) {
    return event;
  }
  const { proposals } = event as { proposals: unknown[] };
  return {
    ...event,
    proposals: proposals.map((p) => (p && typeof p === "object" && !("year" in p) ? { ...p, year: null } : p)),
  };
};

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const inputSchema = { safeParse: (input: unknown) => ResolveTitlesInput.safeParse(withNullYears(input)) };

/** One log line per call, so the drop rate can be read in CloudWatch Logs Insights. */
export const logDropRate = (output: ResolveTitlesOutput, proposals: number) => {
  const count = (reason: DropReason) => output.dropped.filter((d) => d.reason === reason).length;
  console.log(
    JSON.stringify({
      metric: "grounding_drop_rate",
      tool: "resolve_titles",
      proposals,
      resolved: output.resolved.length,
      droppedNoMatch: count("no_match"),
      droppedNotOnMyServices: count("not_on_my_services"),
      dropRate: proposals ? Math.round((output.dropped.length / proposals) * 1000) / 1000 : 0,
    }),
  );
};

/**
 * `resolve_titles` (grounding rule, FR-5): the model proposes titles, TMDB
 * confirms them. A proposal is shown only when TMDB has a confident match
 * and the title is on the profile's services; otherwise it is dropped with
 * the reason. Everything shown comes from TMDB, never from the model.
 */
export const createResolveTitlesTool = (deps: () => ResolveTitlesDeps) =>
  createToolHandler<ResolveTitlesInput, ResolveTitlesOutput>(inputSchema, async ({ profileId, proposals }) => {
    const runtime = deps();
    const visibility = await loadVisibility(runtime.profiles, profileId);
    const results = await Promise.all(proposals.map((p) => resolve(runtime, p, visibility)));

    const output: ResolveTitlesOutput = { resolved: [], dropped: [] };
    const seen = new Set<string>();
    results.forEach((result, i) => {
      if ("reason" in result) {
        output.dropped.push({ proposal: proposals[i]!, reason: result.reason });
        return;
      }
      // Two proposals can name the same title; show it once.
      const key = `${result.card.type}:${result.card.tmdbId}`;
      if (seen.has(key)) return;
      seen.add(key);
      output.resolved.push(result.card);
    });

    logDropRate(output, proposals.length);
    return output;
  });

export const handler = createResolveTitlesTool(getCatalogRuntime);
