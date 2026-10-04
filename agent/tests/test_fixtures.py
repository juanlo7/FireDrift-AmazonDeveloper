import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from domain import models

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "packages" / "domain" / "fixtures"

# REST fixtures are not mirrored: the agent never calls the REST API.
REGISTRY: dict[str, object] = {
    "socket/app-to-agent/session-start.json": models.SessionStartEvent,
    "socket/app-to-agent/audio-start.json": models.AudioStartEvent,
    "socket/app-to-agent/audio-end.json": models.AudioEndEvent,
    "socket/app-to-agent/chip-select.json": models.ChipSelectEvent,
    "socket/app-to-agent/suggestion-feedback.json": models.SuggestionFeedbackEvent,
    "socket/app-to-agent/session-end.json": models.SessionEndEvent,
    "socket/agent-to-app/transcript.json": models.TranscriptEvent,
    "socket/agent-to-app/thinking.json": models.ThinkingEvent,
    "socket/agent-to-app/answer-delta.json": models.AnswerDeltaEvent,
    "socket/agent-to-app/speech.json": models.SpeechEvent,
    "socket/agent-to-app/suggestion.json": models.SuggestionEvent,
    "socket/agent-to-app/chips.json": models.ChipsEvent,
    "socket/agent-to-app/weights-changed.json": models.WeightsChangedEvent,
    "socket/agent-to-app/answer-done.json": models.AnswerDoneEvent,
    "socket/agent-to-app/fallback.json": models.FallbackEvent,
    "tools/get-weights.input.json": models.GetWeightsInput,
    "tools/get-weights.output.json": models.GetWeightsOutput,
    "tools/update-weights.input.json": models.UpdateWeightsInput,
    "tools/update-weights.output.json": models.UpdateWeightsOutput,
    "tools/resolve-titles.input.json": models.ResolveTitlesInput,
    "tools/resolve-titles.output.json": models.ResolveTitlesOutput,
    "tools/similar.input.json": models.SimilarInput,
    "tools/similar.output.json": models.SimilarOutput,
    "tools/ranked-picks.input.json": models.RankedPicksInput,
    "tools/ranked-picks.output.json": models.RankedPicksOutput,
    "pipeline/brain-input-text.json": models.BrainInput,
    "pipeline/brain-input-chip.json": models.BrainInput,
    "pipeline/brain-answer-delta.json": models.BrainEvent,
    "pipeline/cued-sentence.json": models.CuedSentence,
}

MIRRORED_FOLDERS = ("socket", "tools", "pipeline")


def read_fixture(path: str) -> object:
    return json.loads((FIXTURES_DIR / path).read_text())


def test_every_mirrored_fixture_is_registered() -> None:
    files = sorted(
        str(path.relative_to(FIXTURES_DIR))
        for folder in MIRRORED_FOLDERS
        for path in (FIXTURES_DIR / folder).rglob("*.json")
    )
    assert files == sorted(REGISTRY)


@pytest.mark.parametrize(("path", "model"), REGISTRY.items())
def test_fixture_matches_model(path: str, model: object) -> None:
    data = read_fixture(path)
    parsed = TypeAdapter(model).validate_python(data)
    assert TypeAdapter(model).dump_python(parsed, mode="json", by_alias=True, exclude_unset=True) == data


@pytest.mark.parametrize("path", [p for p in REGISTRY if p.startswith("socket/app-to-agent/")])
def test_app_to_agent_union(path: str) -> None:
    models.app_to_agent_event.validate_python(read_fixture(path))


@pytest.mark.parametrize("path", [p for p in REGISTRY if p.startswith("socket/agent-to-app/")])
def test_agent_to_app_union(path: str) -> None:
    models.agent_to_app_event.validate_python(read_fixture(path))


def test_unknown_gesture_is_rejected() -> None:
    with pytest.raises(ValueError):
        models.CuedSentence.model_validate({"text": "Hello.", "cues": [{"gesture": "wink", "charOffset": 0}]})


def test_resolve_titles_caps_proposals() -> None:
    proposal = {"title": "Dark", "year": 2017, "type": "series"}
    with pytest.raises(ValueError):
        models.ResolveTitlesInput.model_validate(
            {"profileId": "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90", "proposals": [proposal] * 6}
        )
