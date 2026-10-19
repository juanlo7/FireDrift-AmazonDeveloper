"""What the brain keeps for one butler session and for the current turn."""

from dataclasses import dataclass, field
from typing import Any

from domain.models import Chip, TitleCard, TitleType, WeightChange

TitleKey = tuple[TitleType, int]


def title_key(title: TitleCard) -> TitleKey:
    return (title.type, title.tmdb_id)


@dataclass
class TurnState:
    """Reset at the start of every turn."""

    # Titles TMDB returned in this turn: the only ones `show_suggestion` accepts.
    grounded: dict[TitleKey, TitleCard] = field(default_factory=dict)
    # Raw tool results of this turn, for the fact check.
    tool_results: list[Any] = field(default_factory=list)
    resolve_calls: int = 0
    # The title on screen when the turn started: "More like this" must not show it again.
    on_screen: TitleCard | None = None
    suggestion: TitleCard | None = None
    weight_change: WeightChange | None = None


@dataclass
class Session:
    """One butler session. `profile_id` comes from `session.start`, never from the model."""

    profile_id: str
    country: str = "ES"
    services: list[int] = field(default_factory=list)
    has_mic: bool = True
    # The title on screen, for chips like "More like this" and "Tell me more".
    current: TitleCard | None = None
    turns: int = 0
    # Things the app told us between turns (suggestion.feedback), for the next input.
    notes: list[str] = field(default_factory=list)
    turn: TurnState = field(default_factory=TurnState)
    last_chips: list[Chip] = field(default_factory=list)
