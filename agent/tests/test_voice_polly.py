import asyncio
import io
import json

from domain.models import CuedSentence, SentenceCue, agent_to_app_event
from voice.polly import PollyConfig, PollyVoiceOut, gesture_times, s3_publisher

MP3 = b"ID3fake-mp3"


def word_marks(text: str, start_ms: int = 6, step_ms: int = 250) -> list[dict]:
    """Word marks the way Polly sends them: UTF-8 byte offsets of each word."""
    marks, byte, time = [], 0, start_ms
    for word in text.split(" "):
        size = len(word.encode("utf-8"))
        marks.append({"time": time, "type": "word", "start": byte, "end": byte + size, "value": word})
        byte += size + 1
        time += step_ms
    return marks


class FakePolly:
    def __init__(self, fail: bool = False):
        self.calls: list[dict] = []
        self.fail = fail

    def synthesize_speech(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError("Polly is down")
        if kwargs["OutputFormat"] == "mp3":
            return {"AudioStream": io.BytesIO(MP3)}
        text = kwargs["Text"]
        marks = [{"time": 0, "type": "sentence", "start": 0, "end": len(text.encode()), "value": text}]
        marks += word_marks(text)
        marks += [{"time": 6, "type": "viseme", "value": "p"}]
        return {"AudioStream": io.BytesIO("\n".join(json.dumps(m) for m in marks).encode())}


async def published_url(audio: bytes) -> str:
    assert audio == MP3
    return "https://audio.example.com/s1.mp3"


def speak(sentence: CuedSentence, polly: FakePolly | None = None):
    polly = polly or FakePolly()
    voice = PollyVoiceOut(polly, published_url, PollyConfig(voice_id="Brian", engine="neural"))
    return asyncio.run(voice.speak(sentence)), polly


def test_speaks_a_sentence_with_marks_and_a_valid_speech_event():
    event, polly = speak(CuedSentence(text="Try 1899 tonight.", cues=[]))

    assert event is not None
    payload = json.loads(event.model_dump_json(by_alias=True, exclude_none=True))
    # If this fails, the app cannot parse the `speech` event.
    assert agent_to_app_event.validate_python(payload).t == "speech"
    assert payload["audioUrl"] == "https://audio.example.com/s1.mp3"
    assert payload["format"] == "mp3"
    assert {m["type"] for m in payload["marks"]} == {"sentence", "word", "viseme"}
    assert [m["value"] for m in payload["marks"] if m["type"] == "word"] == ["Try", "1899", "tonight."]

    formats = sorted(call["OutputFormat"] for call in polly.calls)
    assert formats == ["json", "mp3"]
    assert all(call["Engine"] == "neural" and call["VoiceId"] == "Brian" for call in polly.calls)
    assert all(call["Text"] == "Try 1899 tonight." for call in polly.calls)


def test_a_gesture_plays_on_the_word_it_sits_before():
    sentence = CuedSentence(text="Try 1899 tonight.", cues=[SentenceCue(gesture="excited", char_offset=4)])
    event, _ = speak(sentence)
    assert event is not None
    assert [(g.name, g.time_ms) for g in event.gestures] == [("excited", 256)]


def test_gesture_timing_counts_bytes_not_characters():
    # "Amélie" has a two-byte "é": a character offset would land on the wrong word.
    text = "Amélie is lovely tonight."
    sentence = CuedSentence(text=text, cues=[SentenceCue(gesture="nod", char_offset=text.index("tonight"))])
    marks = word_marks(text)
    assert gesture_times(sentence, marks)[0].time_ms == marks[3]["time"]


def test_a_cue_at_the_start_plays_at_the_first_word_and_without_marks_at_zero():
    sentence = CuedSentence(text="Good evening.", cues=[SentenceCue(gesture="bow", char_offset=0)])
    assert gesture_times(sentence, word_marks("Good evening."))[0].time_ms == 6
    assert gesture_times(sentence, [])[0].time_ms == 0


def test_polly_failure_degrades_to_text_only():
    event, _ = speak(CuedSentence(text="Try 1899.", cues=[]), FakePolly(fail=True))
    assert event is None


def test_s3_publisher_puts_the_mp3_and_returns_a_presigned_url():
    class FakeS3:
        def __init__(self):
            self.put = []

        def put_object(self, **kwargs):
            self.put.append(kwargs)

        def generate_presigned_url(self, operation, Params, ExpiresIn):
            return f"https://s3.example.com/{Params['Key']}?expires={ExpiresIn}"

    s3 = FakeS3()
    url = asyncio.run(s3_publisher(s3, "speech-bucket", expires_s=600)(MP3))
    assert s3.put[0]["Bucket"] == "speech-bucket" and s3.put[0]["Body"] == MP3
    assert s3.put[0]["Key"].startswith("speech/") and s3.put[0]["ContentType"] == "audio/mpeg"
    assert url.endswith("?expires=600")
