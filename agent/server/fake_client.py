"""A fake app: replays the app → agent fixtures over a WebSocket and validates every event back.

Local server:

    uv run python -m server.fake_client ws://localhost:8080/ws

Deployed Runtime, signing in like the TV app (Cognito device sign-up, then the
token in the Authorization header, or with --subprotocol in the
Sec-WebSocket-Protocol header as a client without custom headers does):

    uv run python -m server.fake_client <ButlerWebSocketUrl> --cognito-client <UserPoolClientId> [--subprotocol]
"""

import argparse
import asyncio
import base64
import json
import secrets
import uuid
from pathlib import Path
from urllib.parse import quote
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


def device_token(client_id: str, region: str) -> tuple[str, str]:
    """Signs up a new device (profile ID + random password) and signs in: (profile ID, access token)."""
    import boto3
    from botocore import UNSIGNED
    from botocore.config import Config

    cognito = boto3.client("cognito-idp", region_name=region, config=Config(signature_version=UNSIGNED))
    profile_id, password = str(uuid.uuid4()), secrets.token_urlsafe(24)
    cognito.sign_up(ClientId=client_id, Username=profile_id, Password=password)
    auth = cognito.initiate_auth(
        ClientId=client_id, AuthFlow="USER_PASSWORD_AUTH", AuthParameters={"USERNAME": profile_id, "PASSWORD": password}
    )
    return profile_id, auth["AuthenticationResult"]["AccessToken"]


def runtime_url(url: str) -> str:
    """The Runtime ARN goes URL-encoded in the path."""
    prefix, marker, rest = url.partition("/runtimes/")
    if not marker:
        return url
    arn, _, tail = rest.partition("/ws")
    return f"{prefix}/runtimes/{quote(arn, safe='')}/ws{tail}"


async def main(url: str, client_id: str | None, region: str, subprotocol: bool) -> None:
    connect_args: dict[str, Any] = {}
    start = fixture("session-start")
    if client_id:
        start["profileId"], token = device_token(client_id, region)
        url = runtime_url(url)
        if subprotocol:
            encoded = base64.urlsafe_b64encode(token.encode()).decode().rstrip("=")
            connect_args["subprotocols"] = [f"base64UrlBearerAuthorization.{encoded}", "base64UrlBearerAuthorization"]
        else:
            connect_args["additional_headers"] = {"Authorization": f"Bearer {token}"}
    async with websockets.connect(url, **connect_args) as ws:
        await ws.send(json.dumps(start))
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
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("url", nargs="?", default="ws://localhost:8080/ws")
    parser.add_argument("--cognito-client", help="UserPoolClientId: sign in like the TV app")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--subprotocol", action="store_true", help="Send the token in Sec-WebSocket-Protocol")
    args = parser.parse_args()
    asyncio.run(main(args.url, args.cognito_client, args.region, args.subprotocol))
