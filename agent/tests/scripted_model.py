"""A Strands model that plays a script instead of calling Bedrock.

Each step is one model reply: text chunks and/or tool calls, streamed in the
Bedrock ConverseStream event format, so the real Strands loop runs our real tools.
"""

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from strands.models.model import Model


@dataclass
class Step:
    text: list[str] = field(default_factory=list)
    tools: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    error: Exception | None = None


class ScriptedModel(Model):
    def __init__(self, steps: list[Step]):
        self.steps = list(steps)
        self.requests: list[dict[str, Any]] = []

    def update_config(self, **model_config: Any) -> None:
        pass

    def get_config(self) -> dict[str, Any]:
        return {}

    async def structured_output(self, *args: Any, **kwargs: Any) -> AsyncIterator[dict[str, Any]]:
        raise NotImplementedError
        yield {}

    async def stream(self, messages: Any, tool_specs: Any = None, system_prompt: str | None = None, **kwargs: Any):
        self.requests.append({"messages": json.loads(json.dumps(messages, default=str)), "system": system_prompt})
        step = self.steps.pop(0) if self.steps else Step(text=["(no more script)"])
        if step.error:
            raise step.error
        yield {"messageStart": {"role": "assistant"}}
        if step.text:
            for chunk in step.text:
                yield {"contentBlockDelta": {"delta": {"text": chunk}}}
            yield {"contentBlockStop": {}}
        for index, (name, args) in enumerate(step.tools):
            yield {"contentBlockStart": {"start": {"toolUse": {"toolUseId": f"tool-{len(self.requests)}-{index}", "name": name}}}}
            yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}
            yield {"contentBlockStop": {}}
        yield {"messageStop": {"stopReason": "tool_use" if step.tools else "end_turn"}}

    def tool_results(self) -> list[dict[str, Any]]:
        """Every toolResult block the model received, in order."""
        results = []
        for request in self.requests:
            for message in request["messages"]:
                for block in message.get("content", []):
                    if "toolResult" in block:
                        results.append(block["toolResult"])
        seen, unique = set(), []
        for r in results:
            if r["toolUseId"] not in seen:
                seen.add(r["toolUseId"])
                unique.append(r)
        return unique
