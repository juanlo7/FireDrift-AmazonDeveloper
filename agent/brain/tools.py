"""The tools the model sees, built per session.

`profileId` is bound here from the session and never appears in a tool
signature, so the model can neither see nor choose it (contracts.md section 5).
Strands passes nested arguments as plain dicts, so each tool validates them.
"""

from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError
from strands import tool

from domain.models import (
    MAX_PROPOSALS_PER_CALL,
    Proposal,
    SuggestionEvent,
    TitleCard,
    WeightDelta,
    WeightsChangedEvent,
)

from .session import Session, title_key
from .tool_client import ToolClient, ToolError

MAX_RESOLVE_CALLS_PER_TURN = 3


class ProposalArg(BaseModel):
    title: str = Field(description="Title as the user would search it")
    year: int | None = Field(default=None, description="Release or first air year, if you know it")
    type: Literal["movie", "series"]


class ChangeArg(BaseModel):
    feature: str = Field(description="Feature key, for example genre:27 or keyword:9826")
    delta: float = Field(description="Between -0.5 and 0.5; negative means less of it")


def _compact(title: TitleCard) -> dict[str, Any]:
    """What the model reads about a title: enough to talk about it, without images or URLs."""
    return {
        "type": title.type,
        "tmdbId": title.tmdb_id,
        "name": title.name,
        "year": title.year,
        "genres": title.genres,
        "runtimeMinutes": title.runtime_minutes,
        "rating": title.rating,
        "overview": title.overview,
        "onMyServices": title.on_my_services,
        "services": [p.name for p in title.providers if p.offer in ("subscription", "free", "ads")],
    }


def build_tools(session: Session, client: ToolClient, emit: Callable[[BaseModel], None]) -> list[Any]:
    """Strands tools bound to one session. `emit` receives brain events as soon as a tool succeeds."""

    def remember(titles: list[TitleCard], raw: Any) -> list[dict[str, Any]]:
        session.turn.tool_results.append(raw)
        # A title shown earlier in this visit is never offered again, so the model cannot pick it.
        titles = [t for t in titles if title_key(t) not in session.suggested]
        for title in titles:
            session.turn.grounded[title_key(title)] = title
        return [_compact(t) for t in titles]

    def failure(cause: Exception) -> dict[str, Any]:
        if isinstance(cause, ToolError):
            return {"error": cause.code, "message": cause.message}
        if isinstance(cause, ValidationError):
            return {"error": "invalid_arguments", "message": str(cause.errors()[:2])}
        raise cause

    @tool
    def get_taste() -> dict[str, Any]:
        """What the user likes and dislikes: the strongest weights, with names, and the last change."""
        try:
            summary = client.get_weights(session.profile_id)
        except (ToolError, ValidationError) as cause:
            return failure(cause)
        session.turn.tool_results.append(summary)
        return summary.model_dump(by_alias=True, mode="json")

    @tool
    def change_taste(changes: list[ChangeArg], reason: str) -> dict[str, Any]:
        """Make the user's taste lean toward (positive delta) or away from (negative delta) up to 3 features.

        Args:
            changes: Features and deltas. Limits are enforced and reported back as clamped.
            reason: Why, in the user's words, for example "You said you are tired of horror."
        """
        try:
            deltas = [WeightDelta.model_validate(c) for c in changes]
            result = client.update_weights(session.profile_id, deltas, reason)
        except (ToolError, ValidationError) as cause:
            return failure(cause)
        session.turn.tool_results.append(result)
        session.turn.weight_change = result.change
        emit(WeightsChangedEvent(t="weights.changed", change=result.change))
        return {
            "applied": [d.model_dump(mode="json") for d in result.change.changes],
            "clamped": result.clamped,
        }

    @tool
    def find_titles(proposals: list[ProposalArg]) -> dict[str, Any]:
        """Look up your proposals on TMDB. Only titles in `resolved` exist and may be shown.

        Args:
            proposals: Up to 5 titles that fit the user.
        """
        if session.turn.resolve_calls >= MAX_RESOLVE_CALLS_PER_TURN:
            return {"error": "limit", "message": "No more lookups this turn. Answer with what you have."}
        session.turn.resolve_calls += 1
        try:
            parsed = [Proposal.model_validate(ProposalArg.model_validate(p).model_dump()) for p in proposals]
            result = client.resolve_titles(session.profile_id, parsed[:MAX_PROPOSALS_PER_CALL])
        except (ToolError, ValidationError) as cause:
            return failure(cause)
        return {
            "resolved": remember(result.resolved, result),
            "dropped": [{"title": d.proposal.title, "reason": d.reason} for d in result.dropped],
        }

    @tool
    def similar_titles(type: Literal["movie", "series"], tmdbId: int, count: int = 5) -> dict[str, Any]:
        """Titles similar to one TMDB title, on the user's services.

        Args:
            type: "movie" or "series".
            tmdbId: TMDB ID from a tool result.
            count: How many, up to 10.
        """
        try:
            wanted = max(1, min(count, 10))
            result = client.similar(session.profile_id, type, tmdbId, wanted, session.suggested)
        except (ToolError, ValidationError) as cause:
            return failure(cause)
        return {"titles": remember(result.titles, result)}

    @tool
    def ranked_picks(count: int = 5) -> dict[str, Any]:
        """The best titles for this user from the taste algorithm, on their services.

        Args:
            count: How many, up to 10.
        """
        try:
            wanted = max(1, min(count, 10))
            result = client.ranked_picks(session.profile_id, wanted, session.suggested)
        except (ToolError, ValidationError) as cause:
            return failure(cause)
        return {"titles": remember(result.titles, result)}

    @tool
    def show_suggestion(type: Literal["movie", "series"], tmdbId: int, reason: str) -> dict[str, Any]:
        """Put one title on screen. It must come from a tool result of this turn.

        Args:
            type: "movie" or "series".
            tmdbId: TMDB ID from find_titles, similar_titles or ranked_picks in this turn.
            reason: One short line on why it fits the user.
        """
        if (type, tmdbId) in session.suggested:
            return {"error": "already_suggested", "message": "You showed that title in this visit. Pick a different one."}
        title = session.turn.grounded.get((type, tmdbId))
        if title is None:
            return {"error": "not_grounded", "message": "That title is not in a tool result of this turn."}
        if session.turn.suggestion is not None:
            return {"error": "limit", "message": "One title per answer is already on screen."}
        session.turn.suggestion = title
        session.current = title
        session.suggested.append((type, tmdbId))
        emit(SuggestionEvent(t="suggestion", title=title, reason=reason.strip()))
        return {"shown": title.name}

    return [get_taste, change_taste, find_titles, similar_titles, ranked_picks, show_suggestion]
