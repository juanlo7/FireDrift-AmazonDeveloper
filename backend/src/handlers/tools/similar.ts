import { SimilarInput, type SimilarOutput, type TitleCard } from "@firedrift/domain";
import type { CatalogService } from "../../catalog/catalogService";
import { toTmdbType } from "../../catalog/mapping";
import type { TmdbClient } from "../../catalog/tmdbClient";
import type { TmdbListItem } from "../../catalog/tmdbTypes";
import { canShow, loadVisibility } from "../../grounding/visibility";
import type { ProfileRepository } from "../../profile/profileStore";
import { getCatalogRuntime } from "../../shared/runtime";
import { createToolHandler } from "../../shared/tool";

/** Same cap as `ranked_picks` (contracts, section 5). */
export const MAX_SIMILAR = 10;
/** Title cards looked up per call, at most. Bounds latency and TMDB calls. */
export const MAX_SIMILAR_LOOKUPS = 24;
const LOOKUP_BATCH = 6;

interface SimilarDeps {
  tmdb: TmdbClient;
  catalog: CatalogService;
  profiles: ProfileRepository;
}

/**
 * `similar` → `{ titles }` for "More like this": TMDB recommendations for one
 * title (then TMDB "similar" if they are not enough), as full title cards,
 * keeping only titles on the profile's services. Never the seed, a repeat, or a
 * title the butler already showed (`exclude`).
 */
export const createSimilarTool = (deps: () => SimilarDeps) =>
  createToolHandler<SimilarInput, SimilarOutput>(SimilarInput, async ({ profileId, type, tmdbId, count, exclude = [] }) => {
    const { tmdb, catalog, profiles } = deps();
    const wanted = Math.min(count, MAX_SIMILAR);
    const visibility = await loadVisibility(profiles, profileId);
    const tmdbType = toTmdbType(type);
    const sources = [
      () => tmdb.recommendations(tmdbType, tmdbId),
      () => tmdb.similar(tmdbType, tmdbId),
    ];

    const titles: TitleCard[] = [];
    const tried = new Set([tmdbId]);
    const shown = new Set(exclude.filter((t) => t.type === type).map((t) => t.tmdbId));
    for (const source of sources) {
      if (titles.length >= wanted || tried.size > MAX_SIMILAR_LOOKUPS) break;
      const ids = [...new Set((await source()).results.map((item: TmdbListItem) => item.id))].filter(
        (id) => !tried.has(id) && !shown.has(id),
      );
      for (let i = 0; i < ids.length && titles.length < wanted; i += LOOKUP_BATCH) {
        const batch = ids.slice(i, i + LOOKUP_BATCH).slice(0, MAX_SIMILAR_LOOKUPS + 1 - tried.size);
        if (batch.length === 0) break;
        batch.forEach((id) => tried.add(id));
        const cards = await Promise.all(
          // One title TMDB cannot serve is skipped, not the whole answer.
          batch.map((id) => catalog.getTitleCard(type, id, visibility.country, visibility.services).catch(() => null)),
        );
        for (const card of cards) {
          if (card && canShow(card, visibility) && titles.length < wanted) titles.push(card);
        }
      }
    }
    return { titles };
  });

export const handler = createSimilarTool(getCatalogRuntime);
