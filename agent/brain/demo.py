"""Talk to the brain from the terminal, against AWS.

Bedrock and the tool Lambdas are real; `resolve_titles` and `similar` answer
from fixtures if the stack does not have them yet. Credentials from `aws login` need
`botocore[crt]` in Python, so export them to the environment instead:

    eval "$(aws configure export-credentials --profile firedrift --format env)"
    uv run python -m brain.demo --profile <uuid> "I'm tired of horror" "something like Dark"
"""

import argparse
import asyncio
import os

import boto3

from domain.models import ChipInput, TextInput

from .brain import Brain
from .config import BrainConfig
from .fixture_tools import FixtureToolClient
from .grounding import unsupported_facts
from .session import Session
from .tool_client import CompositeToolClient, LambdaToolClient

STACK = "FireDrift-dev"
OUTPUTS = {
    "get_weights": "GetWeightsToolArn",
    "update_weights": "UpdateWeightsToolArn",
    "ranked_picks": "RankedPicksToolArn",
    "resolve_titles": "ResolveTitlesToolArn",
    "similar": "SimilarToolArn",
}


def tool_functions(session: boto3.Session) -> dict[str, str]:
    """Lambda ARNs from the stack outputs."""
    stack = session.client("cloudformation").describe_stacks(StackName=STACK)["Stacks"][0]
    outputs = {o["OutputKey"]: o["OutputValue"] for o in stack.get("Outputs", [])}
    found = {tool: next((v for k, v in outputs.items() if suffix in k), None) for tool, suffix in OUTPUTS.items()}
    return {tool: arn for tool, arn in found.items() if arn}


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", required=True, help="FireDrift profile UUID")
    parser.add_argument("--aws-profile", default=os.environ.get("AWS_PROFILE"), help="Unset: credentials from the environment")
    parser.add_argument("inputs", nargs="+", help="What the user says; chip:<id> picks a chip")
    args = parser.parse_args()

    config = BrainConfig()
    aws = boto3.Session(profile_name=args.aws_profile, region_name=config.region)
    functions = tool_functions(aws)
    lambdas = LambdaToolClient(functions, aws.client("lambda"))
    grounding = lambdas if {"resolve_titles", "similar"} <= functions.keys() else FixtureToolClient()
    client = CompositeToolClient(weights=lambdas, grounding=grounding)

    import strands.models.bedrock as bedrock

    brain = Brain(
        client,
        config,
        model_factory=lambda c: bedrock.BedrockModel(
            boto_session=aws, model_id=c.model_id, max_tokens=c.max_tokens, temperature=c.temperature
        ),
    )
    session = brain.start(Session(profile_id=args.profile))

    for raw in args.inputs:
        user_input = (
            ChipInput(kind="chip", chip_id=raw.removeprefix("chip:"))
            if raw.startswith("chip:")
            else TextInput(kind="text", text=raw)
        )
        print(f"\n> {raw}")
        answer = ""
        async for event in session.run_turn(user_input):
            if event.t == "answer.delta":
                answer += event.text
            elif event.t == "suggestion":
                print(f"  [suggestion] {event.title.name} ({event.title.year}) — {event.reason}")
            elif event.t == "weights.changed":
                print(f"  [weights.changed] {[(d.feature, d.delta) for d in event.change.changes]}")
            elif event.t == "chips":
                print(f"  [chips] {[c.id for c in event.chips]}")
            elif event.t == "fallback":
                print(f"  [fallback] {event.reason}: {event.message}")
        print(f"  [answer] {answer.strip()}")
        print(f"  [unsupported facts] {unsupported_facts(answer, session.session.turn.tool_results) or 'none'}")


if __name__ == "__main__":
    asyncio.run(main())
