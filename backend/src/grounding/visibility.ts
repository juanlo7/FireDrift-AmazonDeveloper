import type { TitleCard } from "@firedrift/domain";
import { DEFAULT_PROFILE, type Profile, type ProfileRepository } from "../profile/profileStore";

/** What the butler may show to a profile: its country and services. */
export interface Visibility {
  country: string;
  /** Services for `onMyServices` and the provider order. Empty means all services. */
  services: number[];
  /** With "show everything" on, titles off the user's services are shown too. */
  showEverything: boolean;
}

export const visibilityOf = (profile: Profile | null): Visibility => {
  const { country, services, showEverything } = profile ?? DEFAULT_PROFILE;
  return { country, services: showEverything ? [] : services, showEverything };
};

export const loadVisibility = async (profiles: ProfileRepository, profileId: string) =>
  visibilityOf(await profiles.get(profileId));

export const canShow = (card: TitleCard, visibility: Visibility) =>
  visibility.showEverything || card.onMyServices;
