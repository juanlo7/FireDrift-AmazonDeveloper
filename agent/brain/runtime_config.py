"""Butler settings that change without a redeploy (#48): `CONFIG / ACTIVE` → `butler` in DynamoDB."""

import logging
import time
from numbers import Number
from dataclasses import dataclass, fields, replace
from typing import Any

logger = logging.getLogger(__name__)

CACHE_S = 60


@dataclass(frozen=True)
class ButlerConfig:
    """`enabled` is the kill switch. The limits are read by `caps.check_caps` (#55)."""

    enabled: bool = True
    model_id: str | None = None
    max_turns_per_session: int = 20
    max_turns_per_profile_per_day: int = 60
    max_turns_per_day: int = 1500


_CAMEL = {"modelId": "model_id", "maxTurnsPerSession": "max_turns_per_session",
          "maxTurnsPerProfilePerDay": "max_turns_per_profile_per_day", "maxTurnsPerDay": "max_turns_per_day"}


def parse_butler(item: Any) -> ButlerConfig:
    """Fields of the item that have the right type override the defaults; the rest are ignored."""
    config = ButlerConfig()
    if not isinstance(item, dict):
        return config
    defaults = {f.name: getattr(config, f.name) for f in fields(config)}
    changes = {}
    for key, value in item.items():
        name = _CAMEL.get(key, key)
        if name not in defaults:
            continue
        expected = str if name == "model_id" else type(defaults[name])
        if expected is bool and isinstance(value, bool):
            changes[name] = value
        elif expected is str and isinstance(value, str) and value:
            changes[name] = value
        # DynamoDB returns numbers as Decimal.
        elif expected is int and isinstance(value, Number) and not isinstance(value, bool) and value == int(value):
            changes[name] = int(value)
    return replace(config, **changes)


class ConfigReader:
    """Reads the item at most once a minute; on any error it keeps the last good value."""

    def __init__(self, table: Any | None):
        self._table = table
        self._cached: tuple[float, ButlerConfig] | None = None

    def butler(self) -> ButlerConfig:
        now = time.monotonic()
        if self._cached and now - self._cached[0] < CACHE_S:
            return self._cached[1]
        config = self._cached[1] if self._cached else ButlerConfig()
        if self._table is not None:
            try:
                item = self._table.get_item(Key={"pk": "CONFIG", "sk": "ACTIVE"}).get("Item") or {}
                config = parse_butler(item.get("butler"))
            except Exception:
                logger.exception("Could not read the butler config; keeping the last one")
        self._cached = (now, config)
        return config
