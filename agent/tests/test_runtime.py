import json
from decimal import Decimal

import httpx2
import pytest
from botocore.credentials import Credentials
from starlette.testclient import TestClient

from brain.brain import Brain
from brain.fixture_tools import FixtureToolClient, load_fixture
from brain.mcp_tool_client import McpToolClient, SigV4HttpxAuth
from brain.runtime_config import ButlerConfig, ConfigReader, parse_butler
from brain.tool_client import ToolError
from domain.models import WeightDelta, agent_to_app_event
from server.app import create_app
from tests.scripted_model import ScriptedModel, Step

PROFILE_ID = "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90"
START = {"t": "session.start", "profileId": PROFILE_ID, "country": "ES", "services": [8], "hasMic": True}


class FakeTable:
    def __init__(self, item=None, error=None):
        self.item, self.error, self.reads = item, error, 0

    def get_item(self, Key):
        self.reads += 1
        if self.error:
            raise self.error
        return {"Item": self.item} if self.item is not None else {}


def test_butler_config_reads_dynamodb_types_and_ignores_wrong_ones():
    config = parse_butler({"enabled": False, "modelId": "us.amazon.nova-2-lite-v1:0", "maxTurnsPerSession": Decimal("8"), "maxTurnsPerDay": "lots"})
    assert config == ButlerConfig(enabled=False, model_id="us.amazon.nova-2-lite-v1:0", max_turns_per_session=8)
    assert parse_butler(None) == ButlerConfig()


def test_config_reader_caches_and_keeps_defaults_on_errors():
    table = FakeTable({"pk": "CONFIG", "sk": "ACTIVE", "butler": {"enabled": False}})
    reader = ConfigReader(table)
    assert reader.butler().enabled is False
    reader.butler()
    assert table.reads == 1
    assert ConfigReader(FakeTable(error=RuntimeError("throttled"))).butler() == ButlerConfig()
    assert ConfigReader(None).butler() == ButlerConfig()


class StaticReader(ConfigReader):
    def __init__(self, config):
        super().__init__(None)
        self.config = config

    def butler(self):
        return self.config


def connect(steps, config, seen_models=None):
    model = ScriptedModel(steps)

    def factory(brain_config):
        if seen_models is not None:
            seen_models.append(brain_config.model_id)
        return model

    app = create_app(brain=Brain(FixtureToolClient(), model_factory=factory), config_reader=StaticReader(config))
    return TestClient(app), model


def test_the_kill_switch_answers_session_start_with_a_disabled_fallback():
    client, model = connect([Step(text=["never"])], ButlerConfig(enabled=False))
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        event = agent_to_app_event.validate_python(ws.receive_json())
    assert event.t == "fallback" and event.reason == "disabled" and event.chips
    assert model.requests == []


def test_the_kill_switch_stops_turns_in_an_open_session():
    reader = StaticReader(ButlerConfig())
    model = ScriptedModel([Step(text=["never"])])
    app = create_app(brain=Brain(FixtureToolClient(), model_factory=lambda _c: model), config_reader=reader)
    with TestClient(app).websocket_connect("/ws") as ws:
        ws.send_json(START)
        reader.config = ButlerConfig(enabled=False)
        ws.send_json({"t": "chip.select", "chipId": "surprise_me"})
        event = agent_to_app_event.validate_python(ws.receive_json())
    assert event.reason == "disabled" and model.requests == []


def test_the_model_comes_from_the_runtime_config():
    seen = []
    client, _ = connect([Step(text=["Hi."])], ButlerConfig(model_id="us.amazon.nova-2-lite-v1:0"), seen)
    with client.websocket_connect("/ws") as ws:
        ws.send_json(START)
        ws.send_json({"t": "chip.select", "chipId": "surprise_me"})
        while ws.receive_json()["t"] != "answer.done":
            pass
    assert seen == ["us.amazon.nova-2-lite-v1:0"]


def test_invocations_points_to_the_websocket():
    client, _ = connect([], ButlerConfig())
    assert "/ws" in client.post("/invocations", json={}).json()["message"]


class FakeMcp:
    def __init__(self, result):
        self.result, self.calls = result, []

    def call_tool_sync(self, tool_use_id, name, arguments):
        self.calls.append((name, arguments))
        return self.result


def text_result(body, status="success"):
    return {"status": status, "content": [{"text": json.dumps(body) if not isinstance(body, str) else body}]}


def test_mcp_client_calls_gateway_tool_names_and_parses_the_output():
    mcp = FakeMcp(text_result(load_fixture("update-weights.output.json")))
    result = McpToolClient(mcp).update_weights(PROFILE_ID, [WeightDelta(feature="genre:27", delta=-0.8)], "r")
    assert mcp.calls == [("update-weights___update_weights", {"profileId": PROFILE_ID, "changes": [{"feature": "genre:27", "delta": -0.8}], "reason": "r"})]
    assert result.clamped == ["genre:27"]


@pytest.mark.parametrize(
    ("result", "code"),
    [
        (text_result({"error": {"code": "invalid_input", "message": "bad"}}), "invalid_input"),
        (text_result("Tool not found", status="error"), "gateway_error"),
        (text_result("not json"), "gateway_error"),
    ],
)
def test_mcp_client_turns_failures_into_tool_errors(result, code):
    with pytest.raises(ToolError) as raised:
        McpToolClient(FakeMcp(result)).get_weights(PROFILE_ID)
    assert raised.value.code == code


def test_sigv4_auth_signs_gateway_requests():
    auth = SigV4HttpxAuth(lambda: Credentials("AKIDEXAMPLE", "secret", "token"), "us-east-1")
    request = httpx2.Request("POST", "https://example.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp", content=b'{"a":1}')
    signed = next(auth.auth_flow(request))
    assert signed.headers["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/")
    assert "/us-east-1/bedrock-agentcore/aws4_request" in signed.headers["Authorization"]
    assert signed.headers["X-Amz-Security-Token"] == "token"


def test_the_entry_point_imports_the_app():
    import main

    assert hasattr(main, "create_app")
