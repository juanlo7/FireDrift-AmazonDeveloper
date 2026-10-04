import type { Offer, ProviderOffer } from '@firedrift/domain';

/** One row of the Watch now sheet: a service and every way it offers the title. */
export interface ServiceOption {
  providerId: number;
  name: string;
  logoUrl: string;
  offers: Offer[];
  /** Subscription, free or ads: watchable without paying for this title. */
  included: boolean;
}

const INCLUDED: ReadonlySet<Offer> = new Set(['subscription', 'free', 'ads']);

/**
 * One option per provider, included offers first. Inside each group the order
 * of `providers` is kept: the backend already puts my services first.
 */
export const toServiceOptions = (providers: ProviderOffer[]): ServiceOption[] => {
  const byId = new Map<number, ServiceOption>();
  for (const p of providers) {
    const option = byId.get(p.providerId);
    if (option) {
      if (!option.offers.includes(p.offer)) option.offers.push(p.offer);
      option.included ||= INCLUDED.has(p.offer);
    } else {
      byId.set(p.providerId, {
        providerId: p.providerId,
        name: p.name,
        logoUrl: p.logoUrl,
        offers: [p.offer],
        included: INCLUDED.has(p.offer),
      });
    }
  }
  const options = [...byId.values()];
  return [...options.filter(o => o.included), ...options.filter(o => !o.included)];
};

const OFFER_LABELS: Record<Offer, string> = {
  subscription: 'Included',
  free: 'Free',
  ads: 'Free with ads',
  rent: 'Rent',
  buy: 'Buy',
};

/** `Included`, `Rent · Buy`… shown next to the service name. */
export const offerLabel = (option: ServiceOption): string =>
  option.offers.map(offer => OFFER_LABELS[offer]).join(' · ');
