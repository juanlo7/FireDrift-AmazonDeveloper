"""Quick replies after every answer (FR-5). The code picks them, so there are always chips."""

import json

from domain.models import Chip, TitleCard

from .session import Session

MORE_LIKE_THIS = Chip(id="more_like_this", label="More like this")
SHORTER = Chip(id="shorter", label="Shorter")
DIFFERENT_GENRE = Chip(id="different_genre", label="Different genre")
TELL_ME_MORE = Chip(id="tell_me_more", label="Tell me more")
WATCH_NOW = Chip(id="watch_now", label="Watch now")
SURPRISE_ME = Chip(id="surprise_me", label="Surprise me")

CATALOG = {chip.id: chip for chip in (MORE_LIKE_THIS, SHORTER, DIFFERENT_GENRE, TELL_ME_MORE, WATCH_NOW, SURPRISE_ME)}


def chips_for(session: Session) -> list[Chip]:
    """With a title on screen, chips act on it; without one, they start a search."""
    if session.current:
        return [MORE_LIKE_THIS, TELL_ME_MORE, WATCH_NOW, SHORTER, DIFFERENT_GENRE]
    return [SURPRISE_ME, SHORTER, DIFFERENT_GENRE]


def fallback_chips() -> list[Chip]:
    """When the agent cannot answer, the app serves these from the taste algorithm."""
    return [MORE_LIKE_THIS, SHORTER, DIFFERENT_GENRE]


def tmdb_facts(title: TitleCard) -> dict:
    """The TMDB data of the title on screen that the model may talk about."""
    return {
        "name": title.name,
        "type": title.type,
        "year": title.year,
        "genres": title.genres,
        "runtimeMinutes": title.runtime_minutes,
        "rating": title.rating,
        "overview": title.overview,
        "services": [p.name for p in title.providers if p.offer in ("subscription", "free", "ads")],
    }


def chip_prompt(chip_id: str, session: Session) -> str:
    """What the model reads when the user picks a chip instead of speaking."""
    current = session.current
    about = f'"{current.name}" ({current.type}, tmdbId {current.tmdb_id})' if current else "nothing yet"
    prompts = {
        "more_like_this": f"The user chose 'More like this' for {about}. Suggest a different, related title.",
        "shorter": f"The user chose 'Shorter'. The title on screen is {about}. Suggest something shorter.",
        "different_genre": f"The user chose 'Different genre'. The title on screen is {about}. Suggest another genre.",
        "tell_me_more": f"The user chose 'Tell me more' about {about}. Tell them more using only this TMDB data: "
        f"{json.dumps(tmdb_facts(current)) if current else '{}'}",
        "watch_now": f"The user chose 'Watch now' for {about}. Confirm briefly; the app opens the service.",
        "surprise_me": "The user chose 'Surprise me'. Suggest a title they would like.",
    }
    label = CATALOG[chip_id].label if chip_id in CATALOG else chip_id
    return prompts.get(chip_id, f"The user chose '{label}'.")
