"""Model choice (#51): the demo prompts against each candidate model, on Bedrock and the real tools.

Each model plays the prompts in order in one session, as in the demo video, and
gets a row per prompt: whether it did what the prompt expects, the persona
checks, the time to the first spoken word and the cost of the turn.

    eval "$(aws configure export-credentials --profile firedrift --format env)"
    uv run python -m brain.model_eval --profile <uuid>
"""

import argparse
import asyncio
import os
import re
import time
from dataclasses import dataclass, field

import boto3

from character.cues import GESTURES, MARKER

from .brain import BrainSession
from .config import HAIKU_4_5, NOVA_2_LITE, BrainConfig
from .demo import aws_brain, parse_input
from .grounding import unsupported_facts
from .session import Session

# On-demand USD per million input and output tokens for the `us.` inference profiles, October 2026.
PRICES = {HAIKU_4_5: (1.10, 5.50), NOVA_2_LITE: (0.33, 2.75)}


@dataclass(frozen=True)
class DemoPrompt:
    raw: str
    # Event the turn must emit: "suggestion", "weights.changed", or None for an answer only.
    expects: str | None


DEMO_PROMPTS = [
    DemoPrompt("Something like Dark, but shorter", "suggestion"),
    DemoPrompt("chip:tell_me_more", None),
    DemoPrompt("chip:more_like_this", "suggestion"),
    DemoPrompt("I'm tired of action movies", "weights.changed"),
    DemoPrompt("Something light to watch with my family tonight", "suggestion"),
    DemoPrompt("chip:surprise_me", "suggestion"),
]

SENTENCE_END = re.compile(r"[.!?]+(?:\s|$)")
MARKDOWN = re.compile(r"[*_#`]|^\s*[-•\d]+[.)]?\s", re.MULTILINE)


@dataclass
class TurnResult:
    prompt: DemoPrompt
    kinds: list[str] = field(default_factory=list)
    answer: str = ""
    suggestion: str | None = None
    unsupported: list[str] = field(default_factory=list)
    first_word_s: float | None = None
    turn_s: float = 0
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def did_expected(self) -> bool:
        if "fallback" in self.kinds:
            return False
        return self.prompt.expects is None or self.prompt.expects in self.kinds

    def persona_problems(self) -> list[str]:
        """Rules of `persona.md` a spoken answer breaks."""
        problems = []
        markers = MARKER.findall(self.answer)
        spoken = MARKER.sub("", self.answer).strip()
        if len(SENTENCE_END.findall(spoken + " ")) > 2:
            problems.append("over two sentences")
        if len(markers) > 2:
            problems.append("over two gestures")
        if set(markers) - GESTURES:
            problems.append("unknown gesture")
        if MARKDOWN.search(spoken):
            problems.append("markdown")
        if self.unsupported:
            problems.append("unsupported facts")
        return problems

    def cost(self, model_id: str) -> float:
        price_in, price_out = PRICES.get(model_id, (0, 0))
        return (self.input_tokens * price_in + self.output_tokens * price_out) / 1_000_000


async def evaluate(session: BrainSession, prompts: list[DemoPrompt]) -> list[TurnResult]:
    results = []
    for prompt in prompts:
        result = TurnResult(prompt)
        tokens_before = session.usage
        start = time.monotonic()
        async for event in session.run_turn(parse_input(prompt.raw)):
            result.kinds.append(event.t)
            if event.t == "answer.delta":
                if result.first_word_s is None:
                    result.first_word_s = time.monotonic() - start
                result.answer += event.text
            elif event.t == "suggestion":
                result.suggestion = f"{event.title.name} ({event.title.year})"
        result.turn_s = time.monotonic() - start
        result.unsupported = unsupported_facts(result.answer, session.session.turn.tool_results)
        tokens_after = session.usage
        result.input_tokens = tokens_after[0] - tokens_before[0]
        result.output_tokens = tokens_after[1] - tokens_before[1]
        results.append(result)
    return results


def report(model_id: str, results: list[TurnResult]) -> str:
    def seconds(value: float | None) -> str:
        return "—" if value is None else f"{value:.1f}"

    lines = [
        f"### {model_id}",
        "",
        "| Prompt | Expected | Did it | Shown | Persona | First word (s) | Turn (s) | Tokens in/out | Cost ($) |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r.prompt.raw} | {r.prompt.expects or 'answer'} | {'yes' if r.did_expected else 'no'} "
            f"| {r.suggestion or '—'} | {', '.join(r.persona_problems()) or 'ok'} | {seconds(r.first_word_s)} "
            f"| {seconds(r.turn_s)} | {r.input_tokens}/{r.output_tokens} | {r.cost(model_id):.4f} |"
        )
    passed = sum(r.did_expected and not r.persona_problems() for r in results)
    first_words = sorted(r.first_word_s for r in results if r.first_word_s is not None)
    median = first_words[len(first_words) // 2] if first_words else None
    total = sum(r.cost(model_id) for r in results)
    lines += [
        "",
        f"Passed {passed}/{len(results)}; median first word {seconds(median)} s; "
        f"{total / len(results):.4f} $ per turn.",
    ]
    return "\n".join(lines)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", required=True, help="FireDrift profile UUID")
    parser.add_argument("--aws-profile", default=os.environ.get("AWS_PROFILE"), help="Unset: credentials from the environment")
    parser.add_argument("--models", nargs="+", default=[HAIKU_4_5, NOVA_2_LITE])
    args = parser.parse_args()

    config = BrainConfig()
    aws = boto3.Session(profile_name=args.aws_profile, region_name=config.region)
    brain = aws_brain(aws, config)
    for model_id in args.models:
        session = brain.start(Session(profile_id=args.profile), model_id=model_id)
        results = await evaluate(session, DEMO_PROMPTS)
        print(report(model_id, results))
        for r in results:
            print(f"\n> {r.prompt.raw}\n  {r.answer.strip()}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
