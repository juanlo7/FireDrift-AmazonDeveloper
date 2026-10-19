"""Checks that facts in an answer come from tool results (FR-5: TMDB is the only source)."""

import json
import re
from typing import Any

from pydantic import BaseModel

YEAR = re.compile(r"\b(19[0-9]{2}|20[0-9]{2})\b")
MINUTES = re.compile(r"\b(\d{2,3})[- ]?(?:minutes?|mins?)\b", re.IGNORECASE)
RATING = re.compile(r"\b(\d(?:\.\d)?)\s*(?:/\s*10|out of 10|stars?)\b", re.IGNORECASE)
GESTURE = re.compile(r"\{\{\w+\}\}")

# Streaming services the model might name without a tool result to back it.
KNOWN_SERVICES = (
    "Netflix",
    "Prime Video",
    "Amazon Prime",
    "Disney+",
    "Disney Plus",
    "HBO",
    "Max",
    "Apple TV",
    "Movistar",
    "SkyShowtime",
    "Filmin",
    "Hulu",
    "Paramount",
    "Peacock",
)


def _as_text(results: list[Any]) -> str:
    def dump(value: Any) -> Any:
        return value.model_dump(by_alias=True, mode="json") if isinstance(value, BaseModel) else value

    return json.dumps([dump(r) for r in results], ensure_ascii=False)


def unsupported_facts(answer: str, tool_results: list[Any]) -> list[str]:
    """Years, runtimes, ratings and services in `answer` that no tool result of the turn contains."""
    source = _as_text(tool_results)
    text = GESTURE.sub("", answer)
    problems: list[str] = []
    for year in YEAR.findall(text):
        if year not in source:
            problems.append(f"year {year}")
    for minutes in MINUTES.findall(text):
        if f'"runtimeMinutes": {minutes}' not in source:
            problems.append(f"runtime {minutes} min")
    for rating in RATING.findall(text):
        if f'"rating": {rating}' not in source:
            problems.append(f"rating {rating}")
    for service in KNOWN_SERVICES:
        if re.search(rf"\b{re.escape(service)}(?!\w)", text, re.IGNORECASE) and service.lower() not in source.lower():
            problems.append(f"service {service}")
    return problems
