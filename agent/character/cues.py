"""Gesture cue parser (contracts.md section 6, #94).

The model writes `{{gesture}}` right before the word a gesture goes with. The
parser turns its streamed answer into clean sentences, each with at most one
cue at the character offset of that word. Polly then gives the cue its time.
"""

import re
from typing import get_args

from domain.models import CuedSentence, Gesture, SentenceCue
from server.pipeline import MARKDOWN_EMPHASIS, SentenceSplitter

GESTURES = frozenset(get_args(Gesture))
MAX_CUES_PER_ANSWER = 2

MARKER = re.compile(r"\{\{\s*(\w*)\s*\}\}\s*")
# Stands for a kept marker while the text is cleaned, so its offset follows every edit.
SLOT = "\x00"
# "creepy {{shiver}}." would leave "creepy ." behind.
SPACE_BEFORE_PUNCTUATION = re.compile(rf"\s+({SLOT}+)(?=[.,!?;:])")


class CueParser(SentenceSplitter):
    """One per answer: keeps the first known gesture of each sentence, up to two per answer."""

    def __init__(self) -> None:
        super().__init__()
        self._cues_left = MAX_CUES_PER_ANSWER

    def _sentence(self, text: str) -> CuedSentence | None:
        gestures: list[str] = []

        def mark(match: re.Match[str]) -> str:
            gestures.append(match.group(1).lower())
            return SLOT

        slotted = MARKDOWN_EMPHASIS.sub(r"\2", MARKER.sub(mark, text))
        slotted = SPACE_BEFORE_PUNCTUATION.sub(r"\1", slotted).strip()

        clean, offsets = "", []
        for char in slotted:
            if char == SLOT:
                offsets.append(len(clean))
            else:
                clean += char
        clean = clean.strip()
        if not clean:
            return None

        cues: list[SentenceCue] = []
        for gesture, offset in zip(gestures, offsets):
            if gesture in GESTURES and self._cues_left > 0:
                # A marker after the last word still plays, on the last character.
                cues.append(SentenceCue(gesture=gesture, char_offset=min(offset, len(clean) - 1)))
                self._cues_left -= 1
                break
        return CuedSentence(text=clean, cues=cues)
