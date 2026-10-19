"""A `ToolClient` that answers from `packages/domain/fixtures/tools`, for tests and for #40 until it ships."""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from domain.models import (
    Proposal,
    ResolveTitlesOutput,
    TitleCard,
    TitlesOutput,
    TitleType,
    UpdateWeightsOutput,
    WeightDelta,
    WeightsSummary,
)

from .session import TitleKey

# In the repo the fixtures live in packages/domain; the Runtime package copies them next to the code.
_PACKAGED = Path(__file__).resolve().parents[1] / "fixtures" / "tools"
FIXTURES = _PACKAGED if _PACKAGED.is_dir() else Path(__file__).resolve().parents[2] / "packages" / "domain" / "fixtures" / "tools"


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


class FixtureToolClient:
    """Fixture answers by default; tests can replace any of them and read `calls`."""

    def __init__(self, **overrides: Any):
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._answers: dict[str, Any] = {
            "get_weights": load_fixture("get-weights.output.json"),
            "update_weights": load_fixture("update-weights.output.json"),
            "ranked_picks": load_fixture("ranked-picks.output.json"),
            "resolve_titles": load_fixture("resolve-titles.output.json"),
            "similar": load_fixture("similar.output.json"),
            **overrides,
        }

    def _answer(self, tool: str, **args: Any) -> Any:
        self.calls.append((tool, args))
        answer = self._answers[tool]
        if isinstance(answer, Exception):
            raise answer
        return answer(**args) if callable(answer) else answer

    def get_weights(self, profile_id: str) -> WeightsSummary:
        return WeightsSummary.model_validate(self._answer("get_weights", profile_id=profile_id))

    def update_weights(self, profile_id: str, changes: list[WeightDelta], reason: str) -> UpdateWeightsOutput:
        return UpdateWeightsOutput.model_validate(
            self._answer("update_weights", profile_id=profile_id, changes=changes, reason=reason)
        )

    def ranked_picks(self, profile_id: str, count: int, exclude: Sequence[TitleKey] = ()) -> TitlesOutput:
        return TitlesOutput.model_validate(
            self._answer("ranked_picks", profile_id=profile_id, count=count, exclude=list(exclude))
        )

    def resolve_titles(self, profile_id: str, proposals: list[Proposal]) -> ResolveTitlesOutput:
        return ResolveTitlesOutput.model_validate(
            self._answer("resolve_titles", profile_id=profile_id, proposals=proposals)
        )

    def similar(
        self, profile_id: str, type: TitleType, tmdb_id: int, count: int, exclude: Sequence[TitleKey] = ()
    ) -> TitlesOutput:
        return TitlesOutput.model_validate(
            self._answer("similar", profile_id=profile_id, type=type, tmdb_id=tmdb_id, count=count, exclude=list(exclude))
        )


def title_from_fixtures(tmdb_id: int) -> TitleCard:
    """A `TitleCard` from any tool fixture, by TMDB ID (for tests)."""
    for name in ("resolve-titles.output.json", "similar.output.json", "ranked-picks.output.json"):
        data = load_fixture(name)
        for card in data.get("resolved", data.get("titles", [])):
            if card["tmdbId"] == tmdb_id:
                return TitleCard.model_validate(card)
    raise KeyError(tmdb_id)
