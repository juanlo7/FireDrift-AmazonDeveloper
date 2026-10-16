"""Voice in (#41): Amazon Transcribe streaming over its WebSocket API.

boto3 has no streaming Transcribe client, so this signs the WebSocket URL with
botocore (SigV4 query auth), sends the push-to-talk PCM as event-stream
`AudioEvent` messages and reads the transcript events back with botocore's
event-stream parser. No extra dependency. The audio is never stored (NFR-6).
"""

import asyncio
import binascii
import json
import logging
import struct
from collections.abc import Awaitable, Callable
from typing import Any

from botocore.auth import SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials
from botocore.eventstream import EventStreamBuffer

from server.pipeline import VoiceUnavailable

logger = logging.getLogger(__name__)

# 100 ms of 16 kHz 16-bit mono: the chunk size Transcribe recommends.
CHUNK_BYTES = 3200
# After the last audio, Transcribe needs a moment to finish the last words.
END_TIMEOUT_S = 6.0
URL_EXPIRES_S = 300

Connect = Callable[[str], Awaitable[Any]]


def presigned_url(credentials: Credentials, region: str, sample_rate: int, language: str = "en-US") -> str:
    """The signed `wss://` URL of a streaming session (Transcribe WebSocket API)."""
    host = f"transcribestreaming.{region}.amazonaws.com:8443"
    query = f"language-code={language}&media-encoding=pcm&sample-rate={sample_rate}"
    request = AWSRequest(method="GET", url=f"https://{host}/stream-transcription-websocket?{query}")
    SigV4QueryAuth(credentials, "transcribe", region, expires=URL_EXPIRES_S).add_auth(request)
    return request.url.replace("https://", "wss://", 1)


def _header(name: str, value: str) -> bytes:
    encoded_name, encoded_value = name.encode(), value.encode()
    # Header value type 7 is a string.
    return (
        struct.pack(">B", len(encoded_name)) + encoded_name + struct.pack(">BH", 7, len(encoded_value)) + encoded_value
    )


def audio_event(pcm: bytes) -> bytes:
    """One event-stream message carrying PCM. An empty payload tells Transcribe the audio is over."""
    headers = _header(":content-type", "application/octet-stream") + _header(":event-type", "AudioEvent") + _header(
        ":message-type", "event"
    )
    total = 12 + len(headers) + len(pcm) + 4
    prelude = struct.pack(">II", total, len(headers))
    prelude += struct.pack(">I", binascii.crc32(prelude))
    message = prelude + headers + pcm
    return message + struct.pack(">I", binascii.crc32(message))


def final_texts(event: dict[str, Any]) -> list[str]:
    """The finished segments of one `TranscriptEvent`; partial results are skipped."""
    results = event.get("Transcript", {}).get("Results", [])
    return [r["Alternatives"][0]["Transcript"] for r in results if not r.get("IsPartial") and r.get("Alternatives")]


def _default_connect(url: str) -> Awaitable[Any]:
    import websockets

    return websockets.connect(url, max_size=None)


class TranscribeVoiceIn:
    """One push-to-talk press: `start` opens the stream, `feed` sends PCM, `end` returns the text.
    Any failure raises `VoiceUnavailable`, and the server falls back to chips."""

    def __init__(
        self,
        credentials: Callable[[], Credentials],
        region: str,
        connect: Connect = _default_connect,
        end_timeout_s: float = END_TIMEOUT_S,
    ):
        self._credentials = credentials
        self._region = region
        self._connect = connect
        self._end_timeout_s = end_timeout_s
        self._socket: Any | None = None
        self._reader: asyncio.Task[None] | None = None
        self._texts: list[str] = []
        self._error: str | None = None
        self._pending = b""

    async def start(self, audio_format: str, sample_rate: int) -> None:
        if audio_format != "pcm16":
            self._error = f"unsupported audio format {audio_format}"
            return
        try:
            url = presigned_url(self._credentials(), self._region, sample_rate)
            self._socket = await self._connect(url)
        except Exception as cause:
            logger.warning("Could not open Transcribe streaming: %s", cause)
            self._error = "connect"
            return
        self._reader = asyncio.create_task(self._read())

    async def _read(self) -> None:
        assert self._socket is not None
        buffer = EventStreamBuffer()
        try:
            async for frame in self._socket:
                buffer.add_data(frame if isinstance(frame, bytes) else frame.encode())
                for message in buffer:
                    kind = message.headers.get(":message-type")
                    payload = json.loads(message.payload or b"{}")
                    if kind == "event" and message.headers.get(":event-type") == "TranscriptEvent":
                        self._texts.extend(final_texts(payload))
                    elif kind in ("exception", "error"):
                        self._error = payload.get("Message") or message.headers.get(":exception-type") or "error"
                        logger.warning("Transcribe error: %s", self._error)
        except Exception as cause:
            if not self._texts:
                self._error = self._error or f"read failed: {cause}"

    async def feed(self, chunk: bytes) -> None:
        if self._socket is None or self._error:
            return
        self._pending += chunk
        try:
            while len(self._pending) >= CHUNK_BYTES:
                part, self._pending = self._pending[:CHUNK_BYTES], self._pending[CHUNK_BYTES:]
                await self._socket.send(audio_event(part))
        except Exception as cause:
            self._error = f"send failed: {cause}"

    async def end(self) -> str:
        if self._socket is None:
            raise VoiceUnavailable(self._error or "Voice input is not available.")
        try:
            if self._pending and not self._error:
                await self._socket.send(audio_event(self._pending))
            await self._socket.send(audio_event(b""))
            if self._reader:
                await asyncio.wait_for(self._reader, self._end_timeout_s)
        except Exception as cause:
            logger.warning("Transcribe did not finish: %s", cause)
        finally:
            await self._close()
        text = " ".join(t.strip() for t in self._texts if t.strip())
        if not text and self._error:
            raise VoiceUnavailable(self._error)
        return text

    async def _close(self) -> None:
        if self._reader and not self._reader.done():
            self._reader.cancel()
        try:
            await self._socket.close()
        except Exception:
            pass
