"""Brain settings. Every value comes from the environment, with a default."""

import os
from dataclasses import dataclass, field

HAIKU_4_5 = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
NOVA_2_LITE = "us.amazon.nova-2-lite-v1:0"


def _env(name: str, default: str) -> str:
    return os.environ.get(name) or default


@dataclass(frozen=True)
class ToolFunctions:
    """Lambda names or ARNs of the agent tools (stack outputs `…ToolArn`)."""

    get_weights: str = field(default_factory=lambda: _env("FIREDRIFT_GET_WEIGHTS_FN", ""))
    update_weights: str = field(default_factory=lambda: _env("FIREDRIFT_UPDATE_WEIGHTS_FN", ""))
    ranked_picks: str = field(default_factory=lambda: _env("FIREDRIFT_RANKED_PICKS_FN", ""))
    resolve_titles: str = field(default_factory=lambda: _env("FIREDRIFT_RESOLVE_TITLES_FN", ""))
    similar: str = field(default_factory=lambda: _env("FIREDRIFT_SIMILAR_FN", ""))


@dataclass(frozen=True)
class BrainConfig:
    model_id: str = field(default_factory=lambda: _env("FIREDRIFT_MODEL_ID", HAIKU_4_5))
    region: str = field(default_factory=lambda: _env("AWS_REGION", "us-east-1"))
    # Spoken answers are one or two sentences; a low cap keeps cost and latency down.
    max_tokens: int = field(default_factory=lambda: int(_env("FIREDRIFT_MAX_TOKENS", "400")))
    temperature: float = field(default_factory=lambda: float(_env("FIREDRIFT_TEMPERATURE", "0.5")))
    turn_timeout_s: float = field(default_factory=lambda: float(_env("FIREDRIFT_TURN_TIMEOUT_S", "25")))
    # Model round trips per turn: tool calls plus the final answer.
    max_model_calls: int = field(default_factory=lambda: int(_env("FIREDRIFT_MAX_MODEL_CALLS", "6")))
    tools: ToolFunctions = field(default_factory=ToolFunctions)
