import asyncio
import binascii
import json
import struct

import pytest
from botocore.credentials import Credentials
from botocore.eventstream import EventStreamBuffer

from server.pipeline import VoiceUnavailable
from voice.transcribe import CHUNK_BYTES, TranscribeVoiceIn, _header, audio_event, final_texts, presigned_url

CREDS = Credentials("AKIDEXAMPLE", "secret", "token")


def event_message(event_type: str, payload: dict, message_type: str = "event") -> bytes:
    """A Transcribe → client event-stream message with a JSON payload."""
    headers = _header(":event-type", event_type) + _header(":message-type", message_type)
    if message_type == "exception":
        headers += _header(":exception-type", event_type)
    body = json.dumps(payload).encode()
    prelude = struct.pack(">II", 12 + len(headers) + len(body) + 4, len(headers))
    prelude += struct.pack(">I", binascii.crc32(prelude))
    message = prelude + headers + body
    return message + struct.pack(">I", binascii.crc32(message))


def transcript(text: str, partial: bool = False) -> bytes:
    return event_message(
        "TranscriptEvent",
        {"Transcript": {"Results": [{"IsPartial": partial, "Alternatives": [{"Transcript": text}]}]}},
    )


class FakeSocket:
    def __init__(self, replies: list[bytes]):
        self.sent: list[bytes] = []
        self._replies = replies
        self._done = asyncio.Event()
        self.closed = False

    async def send(self, data: bytes) -> None:
        self.sent.append(data)
        if data == audio_event(b""):
            self._done.set()

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        await self._done.wait()
        for reply in self._replies:
            yield reply

    async def close(self) -> None:
        self.closed = True


def run(coro):
    return asyncio.run(coro)


def test_audio_events_parse_back_as_event_stream():
    buffer = EventStreamBuffer()
    buffer.add_data(audio_event(b"\x01\x02\x03"))
    (message,) = list(buffer)
    assert message.headers[":event-type"] == "AudioEvent"
    assert message.headers[":message-type"] == "event"
    assert message.payload == b"\x01\x02\x03"


def test_the_url_is_signed_for_transcribe_streaming():
    url = presigned_url(CREDS, "us-east-1", 16000)
    assert url.startswith("wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?")
    for part in ("media-encoding=pcm", "sample-rate=16000", "language-code=en-US", "X-Amz-Signature=", "X-Amz-Security-Token="):
        assert part in url


def test_only_final_results_count():
    event = {"Transcript": {"Results": [{"IsPartial": True, "Alternatives": [{"Transcript": "some"}]}]}}
    assert final_texts(event) == []


def test_a_press_sends_100ms_chunks_and_returns_the_final_text():
    socket = FakeSocket([transcript("Something like", partial=True), transcript("Something like Dark."), transcript("Shorter.")])

    async def press():
        voice = TranscribeVoiceIn(lambda: CREDS, "us-east-1", connect=lambda url: _ready(socket))
        await voice.start("pcm16", 16000)
        await voice.feed(b"\x00" * (CHUNK_BYTES * 2 + 100))
        return await voice.end()

    assert run(press()) == "Something like Dark. Shorter."
    payloads = []
    for frame in socket.sent:
        buffer = EventStreamBuffer()
        buffer.add_data(frame)
        payloads.append(len(next(iter(buffer)).payload))
    assert payloads == [CHUNK_BYTES, CHUNK_BYTES, 100, 0]
    assert socket.closed


def test_a_transcribe_error_or_no_connection_means_no_voice():
    socket = FakeSocket([event_message("BadRequestException", {"Message": "bad audio"}, "exception")])

    async def press(connect):
        voice = TranscribeVoiceIn(lambda: CREDS, "us-east-1", connect=connect)
        await voice.start("pcm16", 16000)
        await voice.feed(b"\x00" * CHUNK_BYTES)
        return await voice.end()

    with pytest.raises(VoiceUnavailable, match="bad audio"):
        run(press(lambda url: _ready(socket)))

    async def refuse(url):
        raise OSError("no network")

    with pytest.raises(VoiceUnavailable):
        run(press(refuse))


async def _ready(value):
    return value
