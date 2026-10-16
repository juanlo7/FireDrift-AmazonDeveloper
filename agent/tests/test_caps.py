from brain.caps import DAILY_CAP_MESSAGE, SESSION_CAP_MESSAGE, Caps, DynamoTurnCounter
from brain.runtime_config import ButlerConfig
from brain.session import Session

LIMITS = ButlerConfig(max_turns_per_session=3, max_turns_per_profile_per_day=2, max_turns_per_day=3)


class MemoryCounter:
    def __init__(self, fail: bool = False):
        self.turns: dict[tuple[str, str], int] = {}
        self.fail = fail

    def add_turn(self, profile_id: str, day: str) -> tuple[int, int]:
        if self.fail:
            raise RuntimeError("DynamoDB is down")
        for key in ((day, profile_id), (day, "*")):
            self.turns[key] = self.turns.get(key, 0) + 1
        return self.turns[(day, profile_id)], self.turns[(day, "*")]


def session(profile: str = "a", turns: int = 0) -> Session:
    return Session(profile_id=profile, turns=turns)


def test_the_session_cap_stops_a_long_session_without_counting():
    counter = MemoryCounter()
    caps = Caps(lambda: LIMITS, counter, today=lambda: "2026-10-13")
    assert caps.check(session(turns=2)) is None
    assert caps.check(session(turns=3)) == SESSION_CAP_MESSAGE
    assert counter.turns[("2026-10-13", "a")] == 1


def test_the_daily_caps_count_per_profile_and_for_everyone():
    day = ["2026-10-13"]
    caps = Caps(lambda: LIMITS, MemoryCounter(), today=lambda: day[0])
    assert [caps.check(session("a")) for _ in range(3)] == [None, None, DAILY_CAP_MESSAGE]
    # Profile b is under its own cap but "a" already used the global day.
    assert caps.check(session("b")) == DAILY_CAP_MESSAGE
    day[0] = "2026-10-14"
    assert caps.check(session("a")) is None


def test_limits_follow_the_runtime_config():
    limits = [LIMITS]
    caps = Caps(lambda: limits[0], None)
    assert caps.check(session(turns=3)) == SESSION_CAP_MESSAGE
    limits[0] = ButlerConfig(max_turns_per_session=10)
    assert caps.check(session(turns=3)) is None


def test_a_counter_outage_does_not_silence_the_butler():
    assert Caps(lambda: LIMITS, MemoryCounter(fail=True)).check(session()) is None


def test_the_dynamo_counter_adds_atomically_and_expires():
    calls = []

    class Table:
        def update_item(self, **kwargs):
            calls.append(kwargs)
            return {"Attributes": {"turns": len(calls)}}

    assert DynamoTurnCounter(Table(), now=lambda: 1000).add_turn("p1", "2026-10-13") == (1, 2)
    assert [c["Key"] for c in calls] == [
        {"pk": "CAPS#2026-10-13", "sk": "PROFILE#p1"},
        {"pk": "CAPS#2026-10-13", "sk": "GLOBAL"},
    ]
    assert calls[0]["UpdateExpression"].startswith("ADD turns :one")
    assert calls[0]["ExpressionAttributeValues"][":expires"] > 1000


def test_the_brain_falls_back_with_chips_once_over_the_session_cap():
    import asyncio

    from brain.brain import Brain
    from brain.fixture_tools import FixtureToolClient
    from domain.models import TextInput
    from tests.scripted_model import ScriptedModel, Step

    model = ScriptedModel([Step(text=["Hello there."])])
    brain = Brain(FixtureToolClient(), model_factory=lambda _c: model, limits=Caps(lambda: ButlerConfig(max_turns_per_session=1)))
    brain_session = brain.start(Session(profile_id="3f2b8c1e-5d4a-4f6b-9c7e-1a2b3c4d5e6f"))

    async def turn():
        return [e async for e in brain_session.run_turn(TextInput(kind="text", text="hi"))]

    assert [e.t for e in asyncio.run(turn())][-1] == "answer.done"
    second = asyncio.run(turn())
    assert [e.t for e in second] == ["fallback"]
    assert second[0].reason == "cap" and second[0].chips
    assert len(model.requests) == 1
