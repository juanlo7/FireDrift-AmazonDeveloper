"""Polly out (#41): one sentence → MP3, speech marks and gesture timing.

The text reaching Polly is already clean (the gesture parser stripped the
`{{gesture}}` markers). Where the audio goes is up to an `AudioPublisher`, so
the same voice works with an audio URL or with binary frames on the socket.
"""

import asyncio
import json
import logging
import os
from collections.abc import Awaitable, Callable
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal, cast

from domain.models import CuedSentence, GestureCue, SpeechEvent, SpeechMark

logger = logging.getLogger(__name__)

DEFAULT_VOICE_ID = "Brian"  # British English neural voice: fits a butler.
# Answers are one or two short sentences; this only guards against a runaway one.
MAX_SENTENCE_CHARS = 400
MARK_TYPES = ("sentence", "word", "viseme")

MarkType = Literal["word", "sentence", "viseme"]


@dataclass(frozen=True)
class PollyConfig:
    voice_id: str = field(default_factory=lambda: os.environ.get("FIREDRIFT_POLLY_VOICE") or DEFAULT_VOICE_ID)
    engine: str = field(default_factory=lambda: os.environ.get("FIREDRIFT_POLLY_ENGINE") or "neural")
    sample_rate: str = "24000"


@dataclass(frozen=True)
class Speech:
    """One synthesized sentence: the MP3 and its marks, before it is published."""

    audio: bytes
    marks: list[SpeechMark]
    gestures: list[GestureCue]


# Where the MP3 goes. Returns the `audioUrl` for the `speech` event, or None
# when the audio travels another way (binary frames after the event).
AudioPublisher = Callable[[bytes], Awaitable[str | None]]


def s3_publisher(s3: Any, bucket: str, expires_s: int = 900, prefix: str = "speech/") -> AudioPublisher:
    """Puts each MP3 in S3 and returns a short-lived presigned URL. Only the butler's
    own answers go there (never the user's voice); a bucket lifecycle rule should expire them."""

    async def publish(audio: bytes) -> str:
        key = f"{prefix}{uuid.uuid4().hex}.mp3"
        await asyncio.to_thread(s3.put_object, Bucket=bucket, Key=key, Body=audio, ContentType="audio/mpeg")
        return cast(
            str,
            s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires_s),
        )

    return publish


def _parse_marks(raw: bytes) -> list[dict[str, Any]]:
    """Polly speech marks: one JSON object per line."""
    return [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]


def to_speech_marks(raw_marks: list[dict[str, Any]]) -> list[SpeechMark]:
    return [
        SpeechMark(time_ms=int(m["time"]), type=cast(MarkType, m["type"]), value=str(m["value"]))
        for m in raw_marks
        if m.get("type") in MARK_TYPES
    ]


def gesture_times(sentence: CuedSentence, raw_marks: list[dict[str, Any]]) -> list[GestureCue]:
    """Each cue plays when Polly says the word it sits before (contracts section 6).

    Polly word marks carry UTF-8 byte offsets (`start`), so the cue's character
    offset is turned into bytes first. A cue after the last word plays at the
    last word; with no word marks it plays at the start.
    """
    words = sorted((m for m in raw_marks if m.get("type") == "word"), key=lambda m: int(m["start"]))
    cues: list[GestureCue] = []
    for cue in sentence.cues:
        offset = len(sentence.text[: cue.char_offset].encode("utf-8"))
        word = next((w for w in words if int(w["start"]) >= offset), words[-1] if words else None)
        cues.append(GestureCue(name=cue.gesture, time_ms=int(word["time"]) if word else 0))
    return cues


class PollyVoiceOut:
    """`VoiceOut` with Amazon Polly. Never raises: without audio the app shows the text (FR-5)."""

    def __init__(self, polly: Any, publish: AudioPublisher, config: PollyConfig | None = None):
        self._polly = polly
        self._publish = publish
        self._config = config or PollyConfig()

    def _call(self, text: str, output_format: str, **extra: Any) -> bytes:
        response = self._polly.synthesize_speech(
            Text=text,
            TextType="text",
            VoiceId=self._config.voice_id,
            Engine=self._config.engine,
            OutputFormat=output_format,
            **extra,
        )
        stream = response["AudioStream"]
        try:
            return cast(bytes, stream.read())
        finally:
            stream.close()

    async def synthesize(self, sentence: CuedSentence) -> Speech:
        """MP3 and marks in parallel (Polly returns them from two calls)."""
        text = sentence.text[:MAX_SENTENCE_CHARS]
        audio, raw = await asyncio.gather(
            asyncio.to_thread(self._call, text, "mp3", SampleRate=self._config.sample_rate),
            asyncio.to_thread(self._call, text, "json", SpeechMarkTypes=list(MARK_TYPES)),
        )
        raw_marks = _parse_marks(raw)
        return Speech(audio=audio, marks=to_speech_marks(raw_marks), gestures=gesture_times(sentence, raw_marks))

    async def speak(self, sentence: CuedSentence) -> SpeechEvent | None:
        try:
            speech = await self.synthesize(sentence)
            audio_url = await self._publish(speech.audio)
        except Exception:
            logger.exception("Polly failed; the sentence is shown without audio")
            return None
        return SpeechEvent.model_validate(
            {
                "t": "speech",
                "audioUrl": audio_url,
                "format": "mp3",
                "marks": [m.model_dump(by_alias=True) for m in speech.marks],
                "gestures": [g.model_dump(by_alias=True) for g in speech.gestures],
            }
        )
