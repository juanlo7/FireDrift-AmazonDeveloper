"""The butler's brain (#49): one Strands agent per session, streaming the events of contracts.md section 7."""

import asyncio
import logging
import re
from collections.abc import AsyncIterator, Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from strands import Agent
from strands.models.model import Model

from domain.models import (
    AnswerDoneEvent,
    BrainAnswerDelta,
    ChipInput,
    ChipsEvent,
    FallbackEvent,
    TextInput,
)

from . import caps
from .chips import chip_prompt, chips_for, fallback_chips
from .config import BrainConfig
from .session import Session, TurnState
from .tool_client import ToolClient
from .tools import build_tools

logger = logging.getLogger(__name__)

HERE = Path(__file__).resolve().parent
ERROR_MESSAGE = "I lost my train of thought. Here are some picks for you."


def system_prompt() -> str:
    """Persona (P3, `persona.md`) followed by the tool and grounding rules (P2)."""
    def read(path: Path) -> str:
        return re.sub(r"<!--.*?-->", "", path.read_text(), flags=re.DOTALL).strip()

    return f"{read(HERE / 'persona.md')}\n\n{read(HERE / 'prompts' / 'grounding.md')}\n"


def bedrock_model(config: BrainConfig) -> Model:
    from strands.models.bedrock import BedrockModel

    return BedrockModel(
        model_id=config.model_id,
        region_name=config.region,
        max_tokens=config.max_tokens,
        temperature=config.temperature,
    )


class BrainSession:
    """One butler session: its agent keeps the conversation, `run_turn` answers one input."""

    def __init__(
        self, session: Session, client: ToolClient, model: Model, config: BrainConfig, limits: caps.Caps | None = None
    ):
        self.session = session
        self._config = config
        self._caps = limits or caps.Caps()
        self._pending: list[BaseModel] = []
        self._agent = Agent(
            model=model,
            tools=build_tools(session, client, self._pending.append),
            system_prompt=system_prompt(),
            callback_handler=None,
        )

    @property
    def messages(self) -> list[Any]:
        return self._agent.messages

    @property
    def usage(self) -> tuple[int, int]:
        """Input and output tokens of every model call in this session so far."""
        usage = self._agent.event_loop_metrics.accumulated_usage
        return usage["inputTokens"], usage["outputTokens"]

    def _drain(self) -> list[BaseModel]:
        events, self._pending[:] = list(self._pending), []
        return events

    async def run_turn(self, user_input: TextInput | ChipInput) -> AsyncIterator[BaseModel]:
        """Brain events for one input: answer text with gesture markers, suggestion,
        weights.changed, then chips and answer.done; or a single fallback."""
        session = self.session
        cap_message = self._caps.check(session)
        if cap_message:
            yield FallbackEvent(t="fallback", reason="cap", message=cap_message, chips=fallback_chips())
            return

        session.turns += 1
        session.turn = TurnState(on_screen=session.current)
        prompt = user_input.text if isinstance(user_input, TextInput) else chip_prompt(user_input.chip_id, session)
        if session.notes:
            prompt = "Context: " + " ".join(session.notes) + "\n" + prompt
            session.notes.clear()
        if isinstance(user_input, ChipInput) and session.current:
            # The TMDB card of the title on screen backs what the answer says about it.
            session.turn.tool_results.append(session.current)
        self._agent.messages[:] = caps.trim_history(self._agent.messages)

        try:
            async with asyncio.timeout(self._config.turn_timeout_s):
                async for event in self._agent.stream_async(prompt, limits={"turns": self._config.max_model_calls}):
                    for pending in self._drain():
                        yield pending
                    text = event.get("data") if isinstance(event, dict) else None
                    if text:
                        yield BrainAnswerDelta(t="answer.delta", text=text)
        except Exception:
            logger.exception("Brain turn failed")
            self._drain()
            yield FallbackEvent(t="fallback", reason="error", message=ERROR_MESSAGE, chips=fallback_chips())
            return

        for pending in self._drain():
            yield pending
        session.last_chips = chips_for(session)
        yield ChipsEvent(t="chips", chips=session.last_chips)
        yield AnswerDoneEvent(t="answer.done")


class Brain:
    """Creates brain sessions. Tests pass a scripted `model_factory` and a fixture `ToolClient`."""

    def __init__(
        self,
        client: ToolClient,
        config: BrainConfig | None = None,
        model_factory: Callable[[BrainConfig], Model] = bedrock_model,
        limits: caps.Caps | None = None,
    ):
        self._client = client
        self._config = config or BrainConfig()
        self._model_factory = model_factory
        self._caps = limits or caps.Caps()

    def start(self, session: Session, model_id: str | None = None) -> BrainSession:
        """`model_id` (from the runtime config) overrides the configured model for this session."""
        config = replace(self._config, model_id=model_id) if model_id else self._config
        return BrainSession(session, self._client, self._model_factory(config), config, self._caps)
