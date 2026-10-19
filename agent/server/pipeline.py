"""The steps between the brain and the app that P1 and P3 own (contracts.md section 7).

The server only depends on these interfaces. The placeholders keep the butler
working before the voice (#41) lands; the gesture parser is `character.cues`.
"""

import re
from typing import Protocol

from domain.models import CuedSentence, SpeechEvent

GESTURE_MARKER = re.compile(r"\{\{\s*\w+\s*\}\}\s*")
# Some models add markdown emphasis although the prompt asks for plain text.
MARKDOWN_EMPHASIS = re.compile(r"(\*{1,2}|_{2})(\S.*?\S|\S)\1")
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
# A period after these does not end a sentence ("Dr. Adam Carlsen").
ABBREVIATIONS = ("Dr.", "Mr.", "Mrs.", "Ms.", "St.", "Jr.", "Sr.", "vs.", "Vol.", "No.")


class GestureParser(Protocol):
    """Turns the brain's raw answer text into clean sentences with gesture cues (#94)."""

    def feed(self, raw_text: str) -> list[CuedSentence]:
        """Sentences completed by this chunk."""
        ...

    def flush(self) -> list[CuedSentence]:
        """Whatever is left at the end of the answer."""
        ...


class VoiceOut(Protocol):
    """P1 (#41): Polly for one sentence. None when there is no audio (the app shows the text)."""

    async def speak(self, sentence: CuedSentence) -> SpeechEvent | None: ...


class VoiceIn(Protocol):
    """P1 (#41): Transcribe streaming for one push-to-talk press."""

    async def start(self, audio_format: str, sample_rate: int) -> None: ...

    async def feed(self, chunk: bytes) -> None: ...

    async def end(self) -> str:
        """The final transcript. Raises `VoiceUnavailable` when there is no voice input."""
        ...


class VoiceUnavailable(Exception):
    pass


class SentenceSplitter:
    """Splits sentences on punctuation and drops the markers, without cues. `CueParser` builds on it."""

    def __init__(self) -> None:
        self._buffer = ""

    def _sentence(self, text: str) -> CuedSentence | None:
        clean = MARKDOWN_EMPHASIS.sub(r"\2", GESTURE_MARKER.sub("", text)).strip()
        return CuedSentence(text=clean, cues=[]) if clean else None

    def feed(self, raw_text: str) -> list[CuedSentence]:
        self._buffer += raw_text
        *parts, self._buffer = SENTENCE_END.split(self._buffer)
        done: list[str] = []
        for part in parts:
            if done and done[-1].endswith(ABBREVIATIONS):
                done[-1] = f"{done[-1]} {part}"
            else:
                done.append(part)
        if done and done[-1].endswith(ABBREVIATIONS):
            self._buffer = f"{done.pop()} {self._buffer}"
        return [s for s in map(self._sentence, done) if s]

    def flush(self) -> list[CuedSentence]:
        rest, self._buffer = self._buffer, ""
        sentence = self._sentence(rest)
        return [sentence] if sentence else []


class SilentVoiceOut:
    """Placeholder: no audio yet, so no `speech` event."""

    async def speak(self, sentence: CuedSentence) -> SpeechEvent | None:
        return None


class NoVoiceIn:
    """Placeholder: no voice input yet; the butler answers with chips."""

    async def start(self, audio_format: str, sample_rate: int) -> None:
        return None

    async def feed(self, chunk: bytes) -> None:
        return None

    async def end(self) -> str:
        raise VoiceUnavailable("Voice input is not available yet.")
