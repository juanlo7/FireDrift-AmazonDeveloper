import asyncio

import pytest

from brain.brain import Brain
from brain.fixture_tools import FixtureToolClient
from brain.model_eval import DEMO_PROMPTS, DemoPrompt, TurnResult, evaluate, report
from brain.session import Session
from tests.scripted_model import ScriptedModel, Step

PROFILE_ID = "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90"

# One scripted model reply per step, for the demo prompts in order.
DEMO_SCRIPT = [
    Step(tools=[("find_titles", {"proposals": [{"title": "1899", "year": 2022, "type": "series"}]})]),
    Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 90669, "reason": "Same creators as Dark."})]),
    Step(text=["{{excited}} Try 1899, from the people behind Dark."]),
    Step(text=["It is a mystery series from 2022 on a ship full of migrants."]),
    Step(tools=[("ranked_picks", {"count": 3})]),
    Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 70523, "reason": "Where 1899 began."})]),
    Step(text=["{{shiver}} Dark, the one that started it all."]),
    Step(tools=[("change_taste", {"changes": [{"feature": "genre:28", "delta": -0.8}], "reason": "Less action."})]),
    Step(text=["{{nod}} Done, less action from now on."]),
    Step(tools=[("ranked_picks", {"count": 3})]),
    Step(tools=[("show_suggestion", {"type": "movie", "tmdbId": 329865, "reason": "Calm and moving."})]),
    Step(text=["How about Arrival?"]),
    Step(tools=[("ranked_picks", {"count": 3})]),
    Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 70523, "reason": "Your top pick."})]),
    Step(text=["{{excited}} Dark again, your top pick."]),
]


def run_demo(steps):
    model = ScriptedModel(steps)
    session = Brain(FixtureToolClient(), model_factory=lambda _config: model).start(Session(profile_id=PROFILE_ID))
    return asyncio.run(evaluate(session, DEMO_PROMPTS))


def test_the_demo_prompts_pass_with_a_model_that_follows_the_script():
    results = run_demo(DEMO_SCRIPT)

    assert [r.did_expected for r in results] == [True] * len(DEMO_PROMPTS)
    assert [r.persona_problems() for r in results] == [[]] * len(DEMO_PROMPTS)
    assert results[0].suggestion == "1899 (2022)"
    assert all(r.first_word_s is not None for r in results)
    assert "Passed 6/6" in report("scripted", results)


def test_a_turn_that_falls_back_or_misses_its_event_does_not_pass():
    results = run_demo([Step(text=["I would try 1899."]), Step(error=RuntimeError("Bedrock down"))])

    assert not results[0].did_expected
    assert "fallback" in results[1].kinds and not results[1].did_expected


def test_persona_checks_follow_persona_md():
    long = TurnResult(DemoPrompt("x", None), answer="One. Two. Three.")
    marked = TurnResult(DemoPrompt("x", None), answer="{{nod}} **Yes.** {{wave}} {{bow}} Bye.")

    assert long.persona_problems() == ["over two sentences"]
    assert marked.persona_problems() == ["over two gestures", "unknown gesture", "markdown"]


def test_cost_uses_the_price_of_the_model():
    result = TurnResult(DemoPrompt("x", None), input_tokens=2_000, output_tokens=100)

    assert result.cost("us.anthropic.claude-haiku-4-5-20251001-v1:0") == pytest.approx(0.00275)
    assert result.cost("unknown") == 0
