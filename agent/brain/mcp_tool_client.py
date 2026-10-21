"""`ToolClient` over AgentCore Gateway (#48): the agent tools as MCP tools, signed with SigV4.

The Gateway names each tool `<target>___<tool>`; the Lambda output comes back as
JSON text content.
"""

import json
import uuid
from collections.abc import Callable, Generator, Sequence
from typing import Any

import httpx2
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

from domain.models import (
    Proposal,
    ResolveTitlesOutput,
    TitlesOutput,
    TitleType,
    UpdateWeightsOutput,
    WeightDelta,
    WeightsSummary,
)

from .session import TitleKey
from .tool_client import ToolError, _check, _dump, exclude_payload

# Gateway target name of each tool (backend/infra/lib/butler-construct.ts).
TARGETS = {
    "get_weights": "get-weights",
    "update_weights": "update-weights",
    "ranked_picks": "ranked-picks",
    "resolve_titles": "resolve-titles",
    "similar": "similar",
}


class SigV4HttpxAuth(httpx2.Auth):
    """Signs every MCP HTTP request for the Gateway's IAM authorizer."""

    requires_request_body = True

    def __init__(self, credentials: Callable[[], Credentials], region: str, service: str = "bedrock-agentcore"):
        self._credentials = credentials
        self._region = region
        self._service = service

    def auth_flow(self, request: httpx2.Request) -> Generator[httpx2.Request, httpx2.Response, None]:
        headers = {k: v for k, v in request.headers.items() if k.lower() not in ("connection", "content-length")}
        aws_request = AWSRequest(method=request.method, url=str(request.url), data=request.content, headers=headers)
        SigV4Auth(self._credentials(), self._service, self._region).add_auth(aws_request)
        request.headers.update(dict(aws_request.headers.items()))
        yield request


class McpToolClient:
    """Calls the tools through a started `strands.tools.mcp.MCPClient` (or anything with `call_tool_sync`)."""

    def __init__(self, mcp_client: Any):
        self._mcp = mcp_client

    def _call(self, tool: str, arguments: dict[str, Any]) -> Any:
        name = f"{TARGETS[tool]}___{tool}"
        result = self._mcp.call_tool_sync(tool_use_id=f"fd-{uuid.uuid4().hex[:12]}", name=name, arguments=arguments)
        texts = [block.get("text", "") for block in result.get("content", []) if "text" in block]
        if result.get("status") == "error":
            raise ToolError("gateway_error", " ".join(texts)[:200])
        try:
            body = json.loads(texts[0]) if texts else None
        except json.JSONDecodeError as cause:
            raise ToolError("gateway_error", texts[0][:200]) from cause
        return _check(body)

    def get_weights(self, profile_id: str) -> WeightsSummary:
        return WeightsSummary.model_validate(self._call("get_weights", {"profileId": profile_id}))

    def update_weights(self, profile_id: str, changes: list[WeightDelta], reason: str) -> UpdateWeightsOutput:
        payload = {"profileId": profile_id, "changes": _dump(changes), "reason": reason}
        return UpdateWeightsOutput.model_validate(self._call("update_weights", payload))

    def ranked_picks(self, profile_id: str, count: int, exclude: Sequence[TitleKey] = ()) -> TitlesOutput:
        payload = {"profileId": profile_id, "count": count, "exclude": exclude_payload(exclude)}
        return TitlesOutput.model_validate(self._call("ranked_picks", payload))

    def resolve_titles(self, profile_id: str, proposals: list[Proposal]) -> ResolveTitlesOutput:
        # The Gateway schema types `year` as an integer, so an unknown year is left out
        # instead of sent as null; the Lambda reads a missing year as null.
        dumped = [p.model_dump(by_alias=True, mode="json", exclude_none=True) for p in proposals]
        payload = {"profileId": profile_id, "proposals": dumped}
        return ResolveTitlesOutput.model_validate(self._call("resolve_titles", payload))

    def similar(
        self, profile_id: str, type: TitleType, tmdb_id: int, count: int, exclude: Sequence[TitleKey] = ()
    ) -> TitlesOutput:
        payload = {"profileId": profile_id, "type": type, "tmdbId": tmdb_id, "count": count}
        return TitlesOutput.model_validate(self._call("similar", {**payload, "exclude": exclude_payload(exclude)}))


def gateway_mcp_client(gateway_url: str, region: str) -> Any:
    """A started Strands MCP client for the Gateway, signing with the Runtime role's credentials."""
    import boto3
    from mcp.client.streamable_http import streamable_http_client
    from strands.tools.mcp import MCPClient

    session = boto3.Session(region_name=region)

    def credentials() -> Credentials:
        return session.get_credentials().get_frozen_credentials()

    def transport():
        client = httpx2.AsyncClient(auth=SigV4HttpxAuth(credentials, region), timeout=30)
        return streamable_http_client(gateway_url, http_client=client)

    return MCPClient(transport).start()
