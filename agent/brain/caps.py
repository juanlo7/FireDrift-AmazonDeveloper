"""Caps and short context (#55, requirements section 7).

The brain asks `Caps.check` before every turn and calls `trim_history` before
calling the model. Over a cap the turn is a `fallback` with chips the app
serves from the taste algorithm; the feed never depends on the butler.
"""

import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from .runtime_config import ButlerConfig
from .session import Session

logger = logging.getLogger(__name__)

KEEP_MESSAGES = 12
SESSION_CAP_MESSAGE = "We have talked a lot this time. Here are some picks for you."
DAILY_CAP_MESSAGE = "I need a rest until tomorrow. Here are some picks for you."
# The table TTL (`ttl`) removes counter items a little after their day.
COUNTER_TTL_S = 3 * 24 * 3600


class TurnCounter(Protocol):
    def add_turn(self, profile_id: str, day: str) -> tuple[int, int]:
        """Counts one turn. Returns the turns of this profile and of everyone on `day`, this one included."""
        ...


class DynamoTurnCounter:
    """Atomic counters in the backend table: `CAPS#<day>` / `PROFILE#<id>` and `CAPS#<day>` / `GLOBAL`."""

    def __init__(self, table: Any, now: Callable[[], float] = time.time):
        self._table = table
        self._now = now

    def _add(self, day: str, sk: str) -> int:
        result = self._table.update_item(
            Key={"pk": f"CAPS#{day}", "sk": sk},
            UpdateExpression="ADD turns :one SET #ttl = if_not_exists(#ttl, :expires)",
            ExpressionAttributeNames={"#ttl": "ttl"},
            ExpressionAttributeValues={":one": 1, ":expires": int(self._now()) + COUNTER_TTL_S},
            ReturnValues="UPDATED_NEW",
        )
        return int(result["Attributes"]["turns"])

    def add_turn(self, profile_id: str, day: str) -> tuple[int, int]:
        return self._add(day, f"PROFILE#{profile_id}"), self._add(day, "GLOBAL")


def utc_day() -> str:
    return datetime.now(UTC).date().isoformat()


class Caps:
    """Turns per session, per profile per day and in total per day. Limits come from the
    runtime config, so they change without a redeploy. Without a counter (tests, local
    runs) only the session cap applies."""

    def __init__(
        self,
        limits: Callable[[], ButlerConfig] = ButlerConfig,
        counter: TurnCounter | None = None,
        today: Callable[[], str] = utc_day,
    ):
        self._limits = limits
        self._counter = counter
        self._today = today

    def check(self, session: Session) -> str | None:
        """A short message to fall back with, or None to answer. Counts the turn when it may run."""
        limits = self._limits()
        if session.turns >= limits.max_turns_per_session:
            return SESSION_CAP_MESSAGE
        if self._counter is None:
            return None
        try:
            profile_turns, all_turns = self._counter.add_turn(session.profile_id, self._today())
        except Exception:
            # The session cap still holds; a counter outage must not silence the butler in the demo.
            logger.exception("Could not count the turn; answering anyway")
            return None
        if profile_turns > limits.max_turns_per_profile_per_day or all_turns > limits.max_turns_per_day:
            return DAILY_CAP_MESSAGE
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
