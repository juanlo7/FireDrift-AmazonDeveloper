import json
import threading
import time

import pytest
from starlette.testclient import TestClient

from brain.brain import Brain
from brain.fixture_tools import FixtureToolClient
from domain.models import agent_to_app_event
from server import app as server_app
from server.app import create_app
from server.pipeline import SentenceSplitter
from tests.scripted_model import ScriptedModel, Step

PROFILE_ID = "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90"
START = {"t": "session.start", "profileId": PROFILE_ID, "country": "ES", "services": [8, 119], "hasMic": True}
SHOW_1899 = [
    Step(tools=[("find_titles", {"proposals": [{"title": "1899", "year": 2022, "type": "series"}]})]),
    Step(tools=[("show_suggestion", {"type": "series", "tmdbId": 90669, "reason": "Same creators."})]),
    Step(text=["{{excited}} Try 1899. ", "It comes from ", "the people behind Dark."]),
]


def client_for(steps, tools=None, **app_args):
    model = ScriptedModel(steps)
    tools = tools or FixtureToolClient()
    app = create_app(brain=Brain(tools, model_factory=lambda _c: model), **app_args)
    return TestClient(app), model, tools


def receive_turn(ws):
    events = []
    while True:
        event = agent_to_app_event.validate_python(ws.receive_json())
        events.append(event)
        if event.t in ("answer.done", "fallback"):
            return events


def test_a_chip_turn_streams_contract_events_in_order_without_gesture_markers():
    client, _, tools = client_for(SHOW_1899)
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "chip.select", "chipId": "surprise_me"})
        events = receive_turn(ws)

    kinds = [e.t for e in events]
    assert kinds[0] == "thinking"
    assert kinds[-2:] == ["chips", "answer.done"]
    assert kinds.index("suggestion") < kinds.index("chips")
    texts = [e.text for e in events if e.t == "answer.delta"]
    assert texts == ["Try 1899.", "It comes from the people behind Dark."]
    assert all("{{" not in t for t in texts)
    assert tools.calls[0][1]["profile_id"] == PROFILE_ID


def test_the_first_frame_must_be_session_start():
    client, _, _ = client_for([])
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"t": "chip.select", "chipId": "surprise_me"})
        event = agent_to_app_event.validate_python(ws.receive_json())
    assert event.t == "fallback" and event.chips


def test_a_new_input_cancels_the_turn_in_progress():
    slow = Step(text=["This answer is too slow."], delay=1.0)
    client, _, _ = client_for([slow, Step(text=["Here is the new answer."])])
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "chip.select", "chipId": "surprise_me"})
        assert ws.receive_json()["t"] == "thinking"
        ws.send_json({"t": "chip.select", "chipId": "different_genre"})
        events = receive_turn(ws)

    texts = [e.text for e in events if e.t == "answer.delta"]
    assert texts == ["Here is the new answer."]
    assert [e.t for e in events].count("answer.done") == 1


def test_without_voice_input_push_to_talk_falls_back_to_chips():
    client, model, _ = client_for([Step(text=["never"])])
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "audio.start", "format": "pcm16", "sampleRate": 16000})
        ws.send_bytes(b"\x00\x01" * 160)
        ws.send_json({"t": "audio.end"})
        event = agent_to_app_event.validate_python(ws.receive_json())
    assert event.t == "fallback" and event.chips
    assert model.requests == []


def test_voice_input_becomes_a_transcript_and_a_turn(monkeypatch):
    class FakeVoiceIn:
        chunks = b""

        async def start(self, audio_format, sample_rate):
            assert (audio_format, sample_rate) == ("pcm16", 16000)

        async def feed(self, chunk):
            FakeVoiceIn.chunks += chunk

        async def end(self):
            return "something like Dark"

    monkeypatch.setattr(server_app, "NoVoiceIn", FakeVoiceIn)
    client, model, _ = client_for(SHOW_1899)
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "audio.start", "format": "pcm16", "sampleRate": 16000})
        ws.send_bytes(b"\x01\x02" * 100)
        ws.send_json({"t": "audio.end"})
        first = agent_to_app_event.validate_python(ws.receive_json())
        events = receive_turn(ws)

    assert first.t == "transcript" and first.text == "something like Dark" and first.final
    assert len(FakeVoiceIn.chunks) == 200
    assert "something like Dark" in json.dumps(model.requests[0]["messages"])
    assert events[-1].t == "answer.done"


def test_a_brain_error_becomes_a_fallback_without_raw_text():
    client, _, _ = client_for([Step(error=RuntimeError("secret stack trace"))])
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "chip.select", "chipId": "surprise_me"})
        events = receive_turn(ws)
    assert events[-1].t == "fallback"
    assert "secret" not in events[-1].message


def test_suggestion_feedback_reaches_the_next_input():
    client, model, _ = client_for([*SHOW_1899, Step(text=["Glad you liked it."])])
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "chip.select", "chipId": "surprise_me"})
        receive_turn(ws)
        ws.send_json({"t": "suggestion.feedback", "tmdbId": 90669, "type": "series", "kind": "like"})
        ws.send_json({"t": "chip.select", "chipId": "more_like_this"})
        receive_turn(ws)
    assert "The user liked 1899." in json.dumps(model.requests[-1]["messages"])


def test_session_end_closes_cleanly():
    client, _, _ = client_for([])
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "session.end"})
        with pytest.raises(Exception):
            ws.receive_json()


def test_an_idle_session_closes():
    client, _, _ = client_for([], idle_timeout_s=0.2)
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        time.sleep(0.4)
        with pytest.raises(Exception):
            ws.receive_json()


def test_the_sentence_splitter_strips_markers_and_keeps_sentences_whole():
    parser = SentenceSplitter()
    first = [s.text for s in parser.feed("{{nod}} Hello there. How")]
    rest = [s.text for s in parser.feed(" are you? Fine")] + [s.text for s in parser.flush()]
    assert first == ["Hello there."]
    assert rest == ["How are you?", "Fine"]


def test_the_sentence_splitter_does_not_split_after_titles():
    parser = SentenceSplitter()
    out = [s.text for s in parser.feed("It stars Dr. Adam Carlsen. ")] + [s.text for s in parser.flush()]
    assert out == ["It stars Dr. Adam Carlsen."]


def test_the_fake_app_client_plays_fixtures_against_a_real_server():
    import asyncio

    import uvicorn

    from server.fake_client import fixture, play_turn

    model = ScriptedModel([*SHOW_1899, Step(text=["Short answer."])])
    app = create_app(brain=Brain(FixtureToolClient(), model_factory=lambda _c: model))
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)
    port = server.servers[0].sockets[0].getsockname()[1]

    async def play():
        import websockets

        async with websockets.connect(f"ws://127.0.0.1:{port}/ws") as ws:
            await ws.send(json.dumps(fixture("session-start")))
            first = await play_turn(ws, fixture("chip-select"))
            await ws.send(json.dumps(fixture("session-end")))
            return first

    try:
        events = asyncio.run(play())
    finally:
        server.should_exit = True
        thread.join(timeout=5)
    assert events[0].t == "thinking" and events[-1].t == "answer.done"
