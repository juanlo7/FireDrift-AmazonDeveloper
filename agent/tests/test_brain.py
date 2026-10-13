import asyncio
import json

import pytest

from brain import caps
from brain.brain import Brain, system_prompt
from brain.fixture_tools import FixtureToolClient, load_fixture
from brain.grounding import unsupported_facts
from brain.session import Session
from brain.tool_client import ToolError
from domain.models import ChipInput, TextInput, brain_event
from tests.scripted_model import ScriptedModel, Step

PROFILE_ID = "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90"
DARK_ISH = {"proposals": [{"title": "1899", "year": 2022, "type": "series"}]}


def run(brain_session, user_input):
    async def collect():
        return [event async for event in brain_session.run_turn(user_input)]

    return asyncio.run(collect())


def start(steps, client=None):
    model = ScriptedModel(steps)
    client = client or FixtureToolClient()
    brain = Brain(client, model_factory=lambda _config: model)
    return brain.start(Session(profile_id=PROFILE_ID)), model, client


def kinds(events):
    return [event.t for event in events]


def text_of(events):
    return "".join(e.text for e in events if e.t == "answer.delta")


def test_every_event_matches_the_brain_contract_and_ends_with_answer_done():
    session, _, _ = start(
        [
            Step(tools=[("find_titles", DARK_ISH)]),
            Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 90669, "reason": "Same creators."})]),
            Step(text=["{{excited}} Try ", "1899, from the people behind Dark."]),
        ]
    )
    events = run(session, TextInput(kind="text", text="something like Dark but shorter"))

    for event in events:
        brain_event.validate_python(event.model_dump(by_alias=True, mode="json"))
    assert kinds(events)[-2:] == ["chips", "answer.done"]
    assert "suggestion" in kinds(events)
    assert "{{excited}}" in text_of(events)


def test_shows_only_titles_resolved_in_this_turn():
    session, model, _ = start(
        [
            Step(tools=[("show_suggestion", {"type": "movie", "tmdbId": 603, "reason": "Invented."})]),
            Step(text=["Let me look that up first."]),
        ]
    )
    events = run(session, TextInput(kind="text", text="show me The Matrix"))

    assert "suggestion" not in kinds(events)
    assert json.loads(model.tool_results()[0]["content"][0]["text"])["error"] == "not_grounded"


def test_a_resolved_title_reaches_the_app_with_its_tmdb_card():
    session, _, _ = start(
        [
            Step(tools=[("find_titles", DARK_ISH)]),
            Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 90669, "reason": "Same creators."})]),
            Step(text=["Try 1899."]),
        ]
    )
    events = run(session, TextInput(kind="text", text="something like Dark"))
    suggestion = next(e for e in events if e.t == "suggestion")

    expected = load_fixture("resolve-titles.output.json")["resolved"][0]
    assert suggestion.title.model_dump(by_alias=True, mode="json") == expected
    assert suggestion.title.tmdb_id > 0
    assert session.session.current.tmdb_id == 90669


def test_a_dropped_proposal_is_never_shown():
    dropped_only = {"resolved": [], "dropped": [{"proposal": {"title": "Ghost Show", "year": 2030, "type": "series"}, "reason": "no_match"}]}
    session, _, _ = start(
        [
            Step(tools=[("find_titles", {"proposals": [{"title": "Ghost Show", "year": 2030, "type": "series"}]})]),
            Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 99999, "reason": "x"})]),
            Step(text=["I could not find that one."]),
        ],
        FixtureToolClient(resolve_titles=dropped_only),
    )
    assert "suggestion" not in kinds(run(session, TextInput(kind="text", text="Ghost Show")))


def test_tired_of_horror_changes_the_weights_and_says_so():
    session, _, client = start(
        [
            Step(tools=[("change_taste", {"changes": [{"feature": "genre:27", "delta": -0.8}], "reason": "You said you are tired of horror."})]),
            Step(text=["{{nod}} Done, less horror from now on."]),
        ]
    )
    events = run(session, TextInput(kind="text", text="I'm tired of horror"))

    tool, args = client.calls[0]
    assert tool == "update_weights" and args["profile_id"] == PROFILE_ID
    change = next(e for e in events if e.t == "weights.changed").change
    assert change.changes[0].feature == "genre:27"
    assert "less horror" in text_of(events)


def test_more_like_this_names_the_title_on_screen_and_needs_a_different_one():
    session, model, _ = start(
        [
            Step(tools=[("find_titles", DARK_ISH)]),
            Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 90669, "reason": "Same creators."})]),
            Step(text=["Try 1899."]),
            # Next turn: "More like this" on 1899.
            Step(tools=[("similar_titles", {"type": "series", "tmdbId": 90669, "count": 3})]),
            Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 90669, "reason": "Again."})]),
            Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 70523, "reason": "The original."})]),
            Step(text=["Then Dark itself."]),
        ],
        FixtureToolClient(similar={"titles": load_fixture("ranked-picks.output.json")["titles"]}),
    )
    run(session, TextInput(kind="text", text="something like Dark"))
    events = run(session, ChipInput(kind="chip", chip_id="more_like_this"))

    last_prompt = json.dumps(model.requests[3]["messages"])
    assert "More like this" in last_prompt and "1899" in last_prompt
    suggestions = [e for e in events if e.t == "suggestion"]
    assert [s.title.tmdb_id for s in suggestions] == [70523]


def test_tell_me_more_facts_come_from_tool_results():
    title = load_fixture("resolve-titles.output.json")["resolved"][0]
    good = f"{title['name']} came out in {title['year']}, episodes run {title['runtimeMinutes']} minutes, on Netflix."
    assert unsupported_facts(good, [load_fixture("resolve-titles.output.json")]) == []
    # This must fail: the year, runtime and service are not in the tool result.
    bad = "It came out in 2015, episodes run 45 minutes, and it is on Disney+."
    assert unsupported_facts(bad, [load_fixture("resolve-titles.output.json")]) == [
        "year 2015",
        "runtime 45 min",
        "service Disney+",
    ]


def test_tell_me_more_gives_the_model_the_tmdb_card_and_backs_its_facts():
    session, model, _ = start(
        [
            Step(tools=[("find_titles", DARK_ISH)]),
            Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 90669, "reason": "Same creators."})]),
            Step(text=["Try 1899."]),
            Step(text=["1899 is from 2022, with 60 minute episodes, on Netflix."]),
        ]
    )
    run(session, TextInput(kind="text", text="something like Dark"))
    events = run(session, ChipInput(kind="chip", chip_id="tell_me_more"))

    prompt = json.dumps(model.requests[-1]["messages"])
    assert "Immigrants on a steamer" in prompt
    assert unsupported_facts(text_of(events), session.session.turn.tool_results) == []


def test_ignores_gesture_markers_in_the_fact_check():
    assert unsupported_facts("{{nod}} Here you go.", []) == []


def test_over_a_cap_falls_back_with_chips(monkeypatch):
    monkeypatch.setattr(caps.Caps, "check", lambda self, session: "That's enough for today.")
    session, model, _ = start([Step(text=["never said"])])
    events = run(session, TextInput(kind="text", text="hi"))

    assert kinds(events) == ["fallback"]
    assert events[0].reason == "cap" and events[0].chips
    assert model.requests == []


def test_a_model_error_falls_back_without_raw_text():
    session, _, _ = start([Step(error=RuntimeError("Bedrock throttled: secret detail"))])
    events = run(session, TextInput(kind="text", text="hi"))

    assert kinds(events) == ["fallback"]
    assert events[0].reason == "error"
    assert "secret" not in events[0].message and events[0].chips


def test_a_failing_tool_is_reported_to_the_model_and_the_turn_goes_on():
    session, model, _ = start(
        [
            Step(tools=[("ranked_picks", {"count": 3})]),
            Step(text=["Let me try something else."]),
        ],
        FixtureToolClient(ranked_picks=ToolError("upstream_error", "Catalog is unavailable.")),
    )
    events = run(session, ChipInput(kind="chip", chip_id="surprise_me"))

    assert kinds(events)[-2:] == ["chips", "answer.done"]
    assert json.loads(model.tool_results()[0]["content"][0]["text"])["error"] == "upstream_error"


def test_profile_id_is_never_a_tool_argument_the_model_sees():
    session, model, _ = start([Step(text=["Hi."])])
    run(session, TextInput(kind="text", text="hi"))
    specs = json.dumps([t.tool_spec for t in session._agent.tool_registry.registry.values()])
    assert "profileId" not in specs and "profile_id" not in specs


def test_find_titles_is_limited_to_three_calls_per_turn():
    lookups = [Step(tools=[("find_titles", DARK_ISH)]) for _ in range(4)]
    session, _, client = start([*lookups, Step(text=["Here is what I found."])])
    run(session, TextInput(kind="text", text="anything"))
    assert [tool for tool, _ in client.calls].count("resolve_titles") == 3


def test_chips_follow_the_title_on_screen():
    session, _, _ = start([Step(text=["Hello."])])
    first = run(session, TextInput(kind="text", text="hi"))
    assert [c.id for c in first[-2].chips] == ["surprise_me", "shorter", "different_genre"]


def test_system_prompt_has_persona_and_grounding_without_comments():
    prompt = system_prompt()
    assert "butler" in prompt and "show_suggestion" in prompt
    assert "<!--" not in prompt
