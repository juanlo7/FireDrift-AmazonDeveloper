"""How the brain reaches the agent tools of contracts.md section 5.

The brain only sees `ToolClient`. Tests use fixtures, local runs call the
Lambdas directly, and the AgentCore Gateway client (MCP) comes with #48.
"""

import json
from typing import Any, Protocol

from domain.models import (
    Proposal,
    ResolveTitlesOutput,
    TitlesOutput,
    TitleType,
    UpdateWeightsOutput,
    WeightDelta,
    WeightsSummary,
)


class ToolError(Exception):
    """A tool answered `{ "error": { code, message } }` or could not be reached."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class ToolClient(Protocol):
    def get_weights(self, profile_id: str) -> WeightsSummary: ...

    def update_weights(self, profile_id: str, changes: list[WeightDelta], reason: str) -> UpdateWeightsOutput: ...

    def ranked_picks(self, profile_id: str, count: int) -> TitlesOutput: ...

    def resolve_titles(self, profile_id: str, proposals: list[Proposal]) -> ResolveTitlesOutput: ...

    def similar(self, profile_id: str, type: TitleType, tmdb_id: int, count: int) -> TitlesOutput: ...


def _check(result: Any) -> Any:
    if isinstance(result, dict) and isinstance(result.get("error"), dict):
        raise ToolError(str(result["error"].get("code", "error")), str(result["error"].get("message", "")))
    return result


def _dump(models: list[Any]) -> list[dict[str, Any]]:
    return [m.model_dump(by_alias=True, mode="json") for m in models]


class LambdaToolClient:
    """Invokes each tool's Lambda with boto3. The event is the tool input (contracts.md section 5)."""

    def __init__(self, functions: dict[str, str], lambda_client: Any):
        self._functions = functions
        self._lambda = lambda_client

    def _invoke(self, tool: str, payload: dict[str, Any]) -> Any:
        function = self._functions.get(tool)
        if not function:
            raise ToolError("not_configured", f"No Lambda configured for {tool}")
        response = self._lambda.invoke(FunctionName=function, Payload=json.dumps(payload).encode())
        body = json.loads(response["Payload"].read() or b"null")
        if response.get("FunctionError"):
            raise ToolError("lambda_error", str(body)[:200])
        return _check(body)

    def get_weights(self, profile_id: str) -> WeightsSummary:
        return WeightsSummary.model_validate(self._invoke("get_weights", {"profileId": profile_id}))

    def update_weights(self, profile_id: str, changes: list[WeightDelta], reason: str) -> UpdateWeightsOutput:
        payload = {"profileId": profile_id, "changes": _dump(changes), "reason": reason}
        return UpdateWeightsOutput.model_validate(self._invoke("update_weights", payload))

    def ranked_picks(self, profile_id: str, count: int) -> TitlesOutput:
        return TitlesOutput.model_validate(self._invoke("ranked_picks", {"profileId": profile_id, "count": count}))

    def resolve_titles(self, profile_id: str, proposals: list[Proposal]) -> ResolveTitlesOutput:
        payload = {"profileId": profile_id, "proposals": _dump(proposals)}
        return ResolveTitlesOutput.model_validate(self._invoke("resolve_titles", payload))

    def similar(self, profile_id: str, type: TitleType, tmdb_id: int, count: int) -> TitlesOutput:
        payload = {"profileId": profile_id, "type": type, "tmdbId": tmdb_id, "count": count}
        return TitlesOutput.model_validate(self._invoke("similar", payload))


class CompositeToolClient:
    """Each tool from the client that has it: P2's Lambdas, and fixtures for #40 until it ships."""

    def __init__(self, weights: ToolClient, grounding: ToolClient):
        self._weights = weights
        self._grounding = grounding

    def get_weights(self, profile_id: str) -> WeightsSummary:
        return self._weights.get_weights(profile_id)

    def update_weights(self, profile_id: str, changes: list[WeightDelta], reason: str) -> UpdateWeightsOutput:
        return self._weights.update_weights(profile_id, changes, reason)

    def ranked_picks(self, profile_id: str, count: int) -> TitlesOutput:
        return self._weights.ranked_picks(profile_id, count)

    def resolve_titles(self, profile_id: str, proposals: list[Proposal]) -> ResolveTitlesOutput:
        return self._grounding.resolve_titles(profile_id, proposals)

    def similar(self, profile_id: str, type: TitleType, tmdb_id: int, count: int) -> TitlesOutput:
        return self._grounding.similar(profile_id, type, tmdb_id, count)
