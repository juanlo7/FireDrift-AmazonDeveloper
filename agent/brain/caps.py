"""Hooks for caps and short context (#55, owner P3).

The brain calls `check_caps` before every turn and `trim_history` before
calling the model. These defaults allow everything and keep the last turns.
"""

from typing import Any

from .session import Session

KEEP_MESSAGES = 12


def check_caps(session: Session) -> str | None:
    """Return a short message to fall back with (turn, daily or global cap, kill switch), or None."""
    return None


def trim_history(messages: list[Any]) -> list[Any]:
    """Messages the model gets: the last few, starting at a user text turn."""
    if len(messages) <= KEEP_MESSAGES:
        return messages
    recent = messages[-KEEP_MESSAGES:]
    # A tool result must follow its tool use, so start at a plain user message.
    for index, message in enumerate(recent):
        content = message.get("content", [])
        if message.get("role") == "user" and all("toolResult" not in block for block in content):
            return recent[index:]
    return messages
