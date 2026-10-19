"""Quick replies after every answer (FR-5).

The model may end its answer with up to three `{{reply: ...}}` markers, the
words the user might say next. They become the first chips. The code adds the
chips for the title on screen, and with no valid reply it keeps the fixed
chips, so there are always chips.
"""

import json
import re

from domain.models import Chip, TitleCard

from .session import Session

MORE_LIKE_THIS = Chip(id="more_like_this", label="More like this")
SHORTER = Chip(id="shorter", label="Shorter")
DIFFERENT_GENRE = Chip(id="different_genre", label="Different genre")
TELL_ME_MORE = Chip(id="tell_me_more", label="Tell me more")
WATCH_NOW = Chip(id="watch_now", label="Watch now")
SURPRISE_ME = Chip(id="surprise_me", label="Surprise me")

CATALOG = {chip.id: chip for chip in (MORE_LIKE_THIS, SHORTER, DIFFERENT_GENRE, TELL_ME_MORE, WATCH_NOW, SURPRISE_ME)}

# A chip the model wrote: its id carries the words, so the app needs no change.
SAY = "say:"
MAX_REPLIES = 3
MAX_REPLY_CHARS = 28
REPLY_MARKER = re.compile(r"\{\{\s*reply\s*:\s*([^{}]*?)\s*\}\}\s*", re.IGNORECASE)


class ReplyExtractor:
    """Takes the `{{reply: ...}}` markers out of the streamed answer, before the
    text is split into sentences, shown or spoken. Other markers pass through."""

    def __init__(self) -> None:
        self._held = ""
        self.replies: list[str] = []

    def _keep(self, match: re.Match[str]) -> str:
        reply = match.group(1).strip()
        known = {r.casefold() for r in self.replies}
        if reply and len(reply) <= MAX_REPLY_CHARS and reply.casefold() not in known:
            if len(self.replies) < MAX_REPLIES:
                self.replies.append(reply)
        return ""

    def feed(self, text: str) -> str:
        """The part of the text that is safe to pass on now."""
        text = REPLY_MARKER.sub(self._keep, self._held + text)
        # Hold back a marker that is not closed yet: it may be a reply.
        start = text.rfind("{{")
        if start != -1 and "}}" not in text[start:]:
            text, self._held = text[:start], text[start:]
        elif text.endswith("{"):
            text, self._held = text[:-1], "{"
        else:
            self._held = ""
        return text

    def flush(self) -> str:
        rest, self._held = self._held, ""
        return REPLY_MARKER.sub(self._keep, rest)


def reply_chip(reply: str) -> Chip:
    return Chip(id=SAY + reply, label=reply)


def chips_for(session: Session, replies: list[str]) -> list[Chip]:
    """The model's replies first. With a title on screen, chips act on it; without one, they start a search."""
    if replies:
        said = {reply.casefold() for reply in replies}
        title_chips = [MORE_LIKE_THIS, WATCH_NOW] if session.current else [SURPRISE_ME]
        return [reply_chip(reply) for reply in replies] + [c for c in title_chips if c.label.casefold() not in said]
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
    if chip_id.startswith(SAY):
        # Only words the agent offered: the id comes from the app, not from the model.
        if any(chip.id == chip_id for chip in session.last_chips):
            return chip_id.removeprefix(SAY)
        return "The user chose a reply that is no longer offered. Suggest a title they would like."
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
