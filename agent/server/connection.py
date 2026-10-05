"""One butler WebSocket session (#50): the server end of contracts.md section 3."""

import asyncio
import logging
from collections.abc import Callable
from typing import Protocol

from pydantic import BaseModel, ValidationError

from brain.brain import Brain, BrainSession
from brain.chips import fallback_chips
from brain.session import Session
from domain.models import (
    AnswerDeltaEvent,
    AudioEndEvent,
    AudioStartEvent,
    ChipInput,
    ChipSelectEvent,
    CuedSentence,
    FallbackEvent,
    SessionEndEvent,
    SessionStartEvent,
    SuggestionFeedbackEvent,
    TextInput,
    ThinkingEvent,
    TranscriptEvent,
    app_to_agent_event,
)

from .pipeline import GestureParser, VoiceIn, VoiceOut, VoiceUnavailable

logger = logging.getLogger(__name__)

ERROR_MESSAGE = "Something went wrong on my side. Here are some picks for you."
NO_VOICE_MESSAGE = "I can't hear you yet. Use the chips below."
FEEDBACK_WORDS = {"like": "liked", "skip": "skipped", "watch_now": "chose to watch"}


class Transport(Protocol):
    """A WebSocket seen by the server: text frames are JSON, binary frames are audio."""

    async def receive(self) -> str | bytes | None:
        """The next frame, or None when the socket is closed."""
        ...

    async def send(self, text: str) -> None: ...

    async def close(self) -> None: ...


class ButlerConnection:
    """Reads app events, runs one brain turn at a time and sends agent events in order.

    A new input during a turn cancels it (the user interrupted). Any failure is a
    `fallback` event with chips; raw errors never reach the app.
    """

    def __init__(
        self,
        transport: Transport,
        brain: Brain,
        parser_factory: Callable[[], GestureParser],
        voice_out: VoiceOut,
        voice_in_factory: Callable[[], VoiceIn],
        idle_timeout_s: float = 600,
    ):
        self._transport = transport
        self._brain = brain
        self._parser_factory = parser_factory
        self._voice_out = voice_out
        self._voice_in_factory = voice_in_factory
        self._idle_timeout_s = idle_timeout_s
        self._send_lock = asyncio.Lock()
        self._turn: asyncio.Task[None] | None = None
        self._voice_in: VoiceIn | None = None
        self.brain_session: BrainSession | None = None

    async def _send(self, event: BaseModel) -> None:
        async with self._send_lock:
            await self._transport.send(event.model_dump_json(by_alias=True, exclude_none=True))

    async def _fallback(self, message: str = ERROR_MESSAGE) -> None:
        await self._send(FallbackEvent(t="fallback", reason="error", message=message, chips=fallback_chips()))

    async def _receive(self) -> str | bytes | None:
        try:
            return await asyncio.wait_for(self._transport.receive(), self._idle_timeout_s)
        except TimeoutError:
            logger.info("Butler session idle, closing")
            return None

    async def run(self) -> None:
        try:
            first = await self._receive()
            start = self._parse(first) if isinstance(first, str) else None
            if not isinstance(start, SessionStartEvent):
                await self._fallback()
                return
            self.brain_session = self._brain.start(
                Session(
                    profile_id=start.profile_id,
                    country=start.country,
                    services=start.services,
                    has_mic=start.has_mic,
                )
            )
            while (frame := await self._receive()) is not None:
                if isinstance(frame, bytes):
                    if self._voice_in:
                        await self._voice_in.feed(frame)
                    continue
                event = self._parse(frame)
                if isinstance(event, SessionEndEvent):
                    break
                await self._handle(event)
        except Exception:
            logger.exception("Butler session failed")
            await self._safe_fallback()
        finally:
            await self._cancel_turn()
            await self._transport.close()

    def _parse(self, frame: str) -> BaseModel | None:
        try:
            return app_to_agent_event.validate_json(frame)
        except ValidationError:
            logger.warning("Ignoring an invalid app event")
            return None

    async def _handle(self, event: BaseModel | None) -> None:
        session = self.brain_session
        assert session is not None
        if isinstance(event, ChipSelectEvent):
            await self._start_turn(ChipInput(kind="chip", chip_id=event.chip_id))
        elif isinstance(event, AudioStartEvent):
            await self._cancel_turn()
            self._voice_in = self._voice_in_factory()
            await self._voice_in.start(event.format, event.sample_rate)
        elif isinstance(event, AudioEndEvent) and self._voice_in:
            voice_in, self._voice_in = self._voice_in, None
            try:
                text = (await voice_in.end()).strip()
            except VoiceUnavailable:
                await self._fallback(NO_VOICE_MESSAGE)
                return
            if text:
                await self._send(TranscriptEvent(t="transcript", text=text, final=True))
                await self._start_turn(TextInput(kind="text", text=text))
        elif isinstance(event, SuggestionFeedbackEvent):
            name = session.session.current.name if session.session.current and session.session.current.tmdb_id == event.tmdb_id else f"{event.type} {event.tmdb_id}"
            session.session.notes.append(f"The user {FEEDBACK_WORDS[event.kind]} {name}.")

    async def _start_turn(self, user_input: TextInput | ChipInput) -> None:
        await self._cancel_turn()
        self._turn = asyncio.create_task(self._run_turn(user_input))

    async def _cancel_turn(self) -> None:
        turn, self._turn = self._turn, None
        if turn and not turn.done():
            turn.cancel()
            try:
                await turn
            except asyncio.CancelledError:
                pass

    async def _say(self, sentence: CuedSentence) -> None:
        await self._send(AnswerDeltaEvent(t="answer.delta", text=sentence.text))
        speech = await self._voice_out.speak(sentence)
        if speech is not None:
            await self._send(speech)

    async def _run_turn(self, user_input: TextInput | ChipInput) -> None:
        session = self.brain_session
        assert session is not None
        parser = self._parser_factory()
        try:
            await self._send(ThinkingEvent(t="thinking"))
            async for event in session.run_turn(user_input):
                if event.t == "answer.delta":
                    for sentence in parser.feed(event.text):
                        await self._say(sentence)
                    continue
                if event.t in ("chips", "answer.done", "fallback"):
                    for sentence in parser.flush():
                        await self._say(sentence)
                await self._send(event)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Butler turn failed")
            await self._safe_fallback()

    async def _safe_fallback(self) -> None:
        try:
            await self._fallback()
        except Exception:
            logger.debug("Could not send the fallback; the socket is gone")
