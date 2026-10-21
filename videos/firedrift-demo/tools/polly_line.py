"""Synthesize a butler line with the agent's own Polly settings: MP3 + word marks."""
import asyncio, json, sys
import boto3
from voice.polly import PollyVoiceOut, PollyConfig
from domain.models import CuedSentence

async def main(text: str, out: str) -> None:
    voice = PollyVoiceOut(boto3.client("polly"), publish=lambda b: asyncio.sleep(0, None), config=PollyConfig())
    speech = await voice.synthesize(CuedSentence(text=text, cues=[]))
    open(out + ".mp3", "wb").write(speech.audio)
    json.dump([m.model_dump() for m in speech.marks], open(out + ".marks.json", "w"), indent=1)
    print(out, len(speech.audio), "bytes,", len(speech.marks), "marks")

asyncio.run(main(sys.argv[1], sys.argv[2]))
