import { z } from "zod";

export const TitleType = z.enum(["movie", "series"]);
export type TitleType = z.infer<typeof TitleType>;

export const Offer = z.enum(["subscription", "free", "ads", "rent", "buy"]);
export type Offer = z.infer<typeof Offer>;

/** ISO 3166-1 alpha-2, for example `ES`. */
export const Country = z.string().regex(/^[A-Z]{2}$/);
export type Country = z.infer<typeof Country>;

/** ISO 8601 timestamp in UTC. */
export const Timestamp = z.iso.datetime();
export type Timestamp = z.infer<typeof Timestamp>;

export const ProviderOffer = z.object({
  providerId: z.number().int(),
  name: z.string(),
  logoUrl: z.url(),
  offer: Offer,
});
export type ProviderOffer = z.infer<typeof ProviderOffer>;

export const TitleCard = z.object({
  tmdbId: z.number().int().positive(),
  type: TitleType,
  name: z.string(),
  year: z.number().int().nullable(),
  overview: z.string(),
  /** TMDB vote average, 0–10. */
  rating: z.number().min(0).max(10).nullable(),
  genres: z.array(z.string()),
  runtimeMinutes: z.number().int().positive().nullable(),
  posterUrl: z.url().nullable(),
  backdropUrl: z.url().nullable(),
  /** YouTube video key of the official trailer. */
  trailerKey: z.string().nullable(),
  /** Providers for the profile's country. */
  providers: z.array(ProviderOffer),
  onMyServices: z.boolean(),
});
export type TitleCard = z.infer<typeof TitleCard>;

export const SignalKind = z.enum(["like", "skip", "watch_now", "trailer_progress"]);
export type SignalKind = z.infer<typeof SignalKind>;

export const SignalSource = z.enum(["feed", "butler"]);
export type SignalSource = z.infer<typeof SignalSource>;

export const Signal = z
  .object({
    /** UUID, idempotency key. */
    signalId: z.uuid(),
    tmdbId: z.number().int().positive(),
    type: TitleType,
    kind: SignalKind,
    /** Watched share of the trailer, 0–1. Only for `trailer_progress`. */
    ratio: z.number().min(0).max(1).optional(),
    source: SignalSource,
    at: Timestamp,
  })
  .refine((signal) => (signal.kind === "trailer_progress") === (signal.ratio !== undefined), {
    message: "ratio is required for trailer_progress and not allowed otherwise",
    path: ["ratio"],
  });
export type Signal = z.infer<typeof Signal>;

/** Feature key `kind:value`, for example `genre:18` or `runtime:short` (domain.md, Feature). */
export const FeatureKey = z
  .string()
  .regex(/^(genre|keyword|person|decade|type|runtime):[a-z0-9_-]+$/);
export type FeatureKey = z.infer<typeof FeatureKey>;

export const WeightDelta = z.object({
  feature: FeatureKey,
  delta: z.number(),
});
export type WeightDelta = z.infer<typeof WeightDelta>;

export const WeightChange = z.object({
  changeId: z.string().min(1),
  changes: z.array(WeightDelta).min(1),
  reason: z.string(),
  at: Timestamp,
  undone: z.boolean(),
});
export type WeightChange = z.infer<typeof WeightChange>;

export const WeightEntry = z.object({
  feature: FeatureKey,
  label: z.string(),
  weight: z.number(),
});
export type WeightEntry = z.infer<typeof WeightEntry>;

export const WeightsSummary = z.object({
  /** Strongest positive weights, top N. */
  likes: z.array(WeightEntry),
  /** Strongest negative weights, top N. */
  dislikes: z.array(WeightEntry),
  lastChange: WeightChange.nullable(),
});
export type WeightsSummary = z.infer<typeof WeightsSummary>;

export const Chip = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type Chip = z.infer<typeof Chip>;

/** One-shot butler gestures (contracts.md, section 6). */
export const Gesture = z.enum(["nod", "shrug", "shiver", "excited", "bow"]);
export type Gesture = z.infer<typeof Gesture>;

export const ApiError = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
