import io
import json

import pytest

from brain.fixture_tools import FixtureToolClient, load_fixture
from brain.tool_client import CompositeToolClient, LambdaToolClient, ToolError
from domain.models import WeightDelta

PROFILE_ID = "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90"


class FakeLambda:
    def __init__(self, body, function_error=None):
        self.body = body
        self.function_error = function_error
        self.invocations = []

    def invoke(self, FunctionName, Payload):
        self.invocations.append((FunctionName, json.loads(Payload)))
        response = {"Payload": io.BytesIO(json.dumps(self.body).encode())}
        if self.function_error:
            response["FunctionError"] = self.function_error
        return response


def test_sends_the_contract_input_and_parses_the_output():
    fake = FakeLambda(load_fixture("update-weights.output.json"))
    client = LambdaToolClient({"update_weights": "fn-update"}, fake)

    result = client.update_weights(PROFILE_ID, [WeightDelta(feature="genre:27", delta=-0.8)], "Tired of horror.")

    assert fake.invocations == [
        ("fn-update", {"profileId": PROFILE_ID, "changes": [{"feature": "genre:27", "delta": -0.8}], "reason": "Tired of horror."})
    ]
    assert result.clamped == ["genre:27"]


def test_turns_a_tool_error_into_tool_error():
    client = LambdaToolClient({"get_weights": "fn"}, FakeLambda({"error": {"code": "invalid_input", "message": "bad"}}))
    with pytest.raises(ToolError) as raised:
        client.get_weights(PROFILE_ID)
    assert raised.value.code == "invalid_input"


def test_turns_a_lambda_crash_into_tool_error():
    client = LambdaToolClient({"ranked_picks": "fn"}, FakeLambda({"errorMessage": "boom"}, function_error="Unhandled"))
    with pytest.raises(ToolError) as raised:
        client.ranked_picks(PROFILE_ID, 3)
    assert raised.value.code == "lambda_error"


def test_a_tool_without_a_function_is_not_configured():
    with pytest.raises(ToolError) as raised:
        LambdaToolClient({}, FakeLambda({})).similar(PROFILE_ID, "series", 70523, 3)
    assert raised.value.code == "not_configured"


def test_composite_sends_weight_tools_and_grounding_tools_to_their_clients():
    weights, grounding = FixtureToolClient(), FixtureToolClient()
    client = CompositeToolClient(weights=weights, grounding=grounding)
    client.get_weights(PROFILE_ID)
    client.ranked_picks(PROFILE_ID, 2)
    client.resolve_titles(PROFILE_ID, [])
    client.similar(PROFILE_ID, "series", 70523, 2)
    assert [c for c, _ in weights.calls] == ["get_weights", "ranked_picks"]
    assert [c for c, _ in grounding.calls] == ["resolve_titles", "similar"]
