"""A fake app: replays the app → agent fixtures over a WebSocket and validates every event back.

    uv run python -m server.fake_client ws://localhost:8080/ws
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import websockets

from domain.models import agent_to_app_event

FIXTURES = Path(__file__).resolve().parents[2] / "packages" / "domain" / "fixtures" / "socket" / "app-to-agent"


def fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.json").read_text())


async def play_turn(ws: Any, frame: dict[str, Any], timeout: float = 60) -> list[Any]:
    """Send one app event and collect agent events until the turn ends."""
    await ws.send(json.dumps(frame))
    events = []
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout)
        event = agent_to_app_event.validate_json(raw)
        events.append(event)
        if event.t in ("answer.done", "fallback"):
            return events


async def main(url: str) -> None:
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps(fixture("session-start")))
        for chip in ("surprise_me", "tell_me_more", "more_like_this"):
            print(f"\n> chip {chip}")
            for event in await play_turn(ws, {"t": "chip.select", "chipId": chip}):
                summary = {
                    "answer.delta": lambda e: e.text,
                    "suggestion": lambda e: f"{e.title.name} — {e.reason}",
                    "chips": lambda e: [c.id for c in e.chips],
                    "weights.changed": lambda e: [(d.feature, d.delta) for d in e.change.changes],
                    "fallback": lambda e: f"{e.reason}: {e.message}",
                }.get(event.t, lambda e: "")(event)
                print(f"  {event.t:16} {summary}")
        await ws.send(json.dumps(fixture("session-end")))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:8080/ws"))
