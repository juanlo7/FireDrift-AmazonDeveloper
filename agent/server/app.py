"""The agent server: Bedrock AgentCore Runtime app with the butler WebSocket at `/ws` (port 8080).

Run locally (credentials from the environment, see agent/README.md):

    uv run python -m server.app
"""

import logging
import os

import boto3
from starlette.websockets import WebSocket, WebSocketDisconnect

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from brain.brain import Brain
from brain.config import BrainConfig
from brain.fixture_tools import FixtureToolClient
from brain.runtime_config import ConfigReader
from brain.tool_client import CompositeToolClient, LambdaToolClient, ToolClient

from .connection import ButlerConnection
from .pipeline import NoVoiceIn, SentenceSplitter, SilentVoiceOut

IDLE_TIMEOUT_S = float(os.environ.get("FIREDRIFT_IDLE_TIMEOUT_S", "600"))


class StarletteTransport:
    def __init__(self, websocket: WebSocket):
        self._websocket = websocket

    async def receive(self) -> str | bytes | None:
        try:
            message = await self._websocket.receive()
        except WebSocketDisconnect:
            return None
        if message["type"] == "websocket.disconnect":
            return None
        return message.get("text") if message.get("text") is not None else message.get("bytes")

    async def send(self, text: str) -> None:
        await self._websocket.send_text(text)

    async def close(self) -> None:
        try:
            await self._websocket.close()
        except RuntimeError:
            pass  # already closed by the client


def default_tool_client(config: BrainConfig) -> ToolClient:
    """Every tool through AgentCore Gateway (`FIREDRIFT_TOOLS=gateway`, the Runtime default)
    or by Lambda (`lambda`, local runs). By Lambda, `resolve_titles` and `similar` answer
    from fixtures while their functions are not configured."""
    if os.environ.get("FIREDRIFT_TOOLS", "lambda") == "gateway":
        from brain.mcp_tool_client import McpToolClient, gateway_mcp_client

        return McpToolClient(gateway_mcp_client(os.environ["FIREDRIFT_GATEWAY_URL"], config.region))
    functions = {
        "get_weights": config.tools.get_weights,
        "update_weights": config.tools.update_weights,
        "ranked_picks": config.tools.ranked_picks,
        "resolve_titles": config.tools.resolve_titles,
        "similar": config.tools.similar,
    }
    client = LambdaToolClient(functions, boto3.client("lambda", region_name=config.region))
    grounding: ToolClient = client if config.tools.resolve_titles and config.tools.similar else FixtureToolClient()
    return CompositeToolClient(weights=client, grounding=grounding)


def default_config_reader(config: BrainConfig) -> ConfigReader:
    table = os.environ.get("TABLE_NAME")
    return ConfigReader(boto3.resource("dynamodb", region_name=config.region).Table(table) if table else None)


def create_app(
    brain: Brain | None = None,
    idle_timeout_s: float = IDLE_TIMEOUT_S,
    config_reader: ConfigReader | None = None,
) -> BedrockAgentCoreApp:
    config = BrainConfig()
    brain = brain or Brain(default_tool_client(config), config)
    reader = config_reader or default_config_reader(config)
    app = BedrockAgentCoreApp()

    @app.entrypoint
    def invocations(payload: dict, context: object) -> dict:
        """The Runtime HTTP contract needs `/invocations`; the butler itself talks over `/ws`."""
        return {"message": "FireDrift butler: connect to /ws"}

    @app.websocket
    async def butler(websocket: WebSocket, context: object) -> None:
        await websocket.accept()
        task = app.add_async_task("butler_session")  # keeps the Runtime session busy, not idle
        try:
            connection = ButlerConnection(
                StarletteTransport(websocket),
                brain,
                parser_factory=SentenceSplitter,
                voice_out=SilentVoiceOut(),
                voice_in_factory=NoVoiceIn,
                idle_timeout_s=idle_timeout_s,
                butler_config=reader.butler,
            )
            await connection.run()
        finally:
            app.complete_async_task(task)

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_app().run(port=int(os.environ.get("PORT", "8080")))
