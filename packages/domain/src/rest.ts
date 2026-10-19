import { z } from "zod";
import { Country, Signal, TitleCard, WeightsSummary } from "./common";

/** Max signals per `POST /profiles/{profileId}/signals` call. */
export const MAX_SIGNALS_PER_BATCH = 50;

// GET /health
export const HealthResponse = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof HealthResponse>;

// GET /providers?country=ES
export const Provider = z.object({
  providerId: z.number().int(),
  name: z.string(),
  logoUrl: z.url(),
});
export type Provider = z.infer<typeof Provider>;

export const ProvidersResponse = z.object({ providers: z.array(Provider) });
export type ProvidersResponse = z.infer<typeof ProvidersResponse>;

// PUT /profiles/{profileId} -> 204
export const ProfilePutBody = z.object({
  country: Country,
  /** `providerId`s the user has. Empty means all services. */
  services: z.array(z.number().int()),
  showEverything: z.boolean(),
});
export type ProfilePutBody = z.infer<typeof ProfilePutBody>;

// GET /profiles/{profileId}/pool?size=20
export const PoolResponse = z.object({
  poolId: z.string().min(1),
  algorithmVersion: z.string().min(1),
  titles: z.array(TitleCard),
});
export type PoolResponse = z.infer<typeof PoolResponse>;

// POST /profiles/{profileId}/signals
export const SignalsBody = z.object({
  signals: z.array(Signal).min(1).max(MAX_SIGNALS_PER_BATCH),
});
export type SignalsBody = z.infer<typeof SignalsBody>;

export const SignalsResponse = z.object({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
});
export type SignalsResponse = z.infer<typeof SignalsResponse>;

// GET /titles/{type}/{tmdbId} -> TitleCard
export const TitleResponse = TitleCard;
export type TitleResponse = TitleCard;

// GET /weights, POST /weights/undo, POST /weights/reset -> WeightsSummary
export const WeightsResponse = WeightsSummary;
export type WeightsResponse = WeightsSummary;
