import { z } from "zod";
import { TitleCard, TitleType, WeightChange, WeightDelta, WeightsSummary } from "./common";

// Agent tools (contracts.md, section 5). `profileId` comes from the session,
// never from the model. Limits are enforced by the tools, not by the prompt.

export const MAX_PROPOSALS_PER_CALL = 5;

const ProfileId = z.uuid();

// get_weights
export const GetWeightsInput = z.object({ profileId: ProfileId });
export type GetWeightsInput = z.infer<typeof GetWeightsInput>;

export const GetWeightsOutput = WeightsSummary;
export type GetWeightsOutput = WeightsSummary;

// update_weights
export const UpdateWeightsInput = z.object({
  profileId: ProfileId,
  changes: z.array(WeightDelta).min(1),
  reason: z.string().min(1),
});
export type UpdateWeightsInput = z.infer<typeof UpdateWeightsInput>;

export const UpdateWeightsOutput = z.object({
  change: WeightChange,
  /** Features whose delta was clamped to the limit. */
  clamped: z.array(z.string()),
});
export type UpdateWeightsOutput = z.infer<typeof UpdateWeightsOutput>;

// resolve_titles
export const Proposal = z.object({
  title: z.string().min(1),
  year: z.number().int().nullable(),
  type: TitleType,
});
export type Proposal = z.infer<typeof Proposal>;

export const ResolveTitlesInput = z.object({
  profileId: ProfileId,
  proposals: z.array(Proposal).min(1).max(MAX_PROPOSALS_PER_CALL),
});
export type ResolveTitlesInput = z.infer<typeof ResolveTitlesInput>;

export const DropReason = z.enum(["no_match", "not_on_my_services"]);
export type DropReason = z.infer<typeof DropReason>;

export const ResolveTitlesOutput = z.object({
  resolved: z.array(TitleCard),
  dropped: z.array(z.object({ proposal: Proposal, reason: DropReason })),
});
export type ResolveTitlesOutput = z.infer<typeof ResolveTitlesOutput>;

// similar
export const SimilarInput = z.object({
  profileId: ProfileId,
  type: TitleType,
  tmdbId: z.number().int().positive(),
  count: z.number().int().positive(),
});
export type SimilarInput = z.infer<typeof SimilarInput>;

export const TitlesOutput = z.object({ titles: z.array(TitleCard) });
export type TitlesOutput = z.infer<typeof TitlesOutput>;

export const SimilarOutput = TitlesOutput;
export type SimilarOutput = TitlesOutput;

// ranked_picks
export const RankedPicksInput = z.object({
  profileId: ProfileId,
  count: z.number().int().positive(),
});
export type RankedPicksInput = z.infer<typeof RankedPicksInput>;

export const RankedPicksOutput = TitlesOutput;
export type RankedPicksOutput = TitlesOutput;
