"""Python mirror of `packages/domain` for the agent.

The zod schemas in `packages/domain/src` are the source of truth. This module
mirrors the parts the agent uses: shared types, the butler socket, the agent
tools and the pipeline between voice, brain and character. Both sides are
tested against the same fixtures in `packages/domain/fixtures`.
"""

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl, TypeAdapter, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """JSON uses camelCase; Python code uses snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


# Shared types (contracts.md, section 1)

TitleType = Literal["movie", "series"]
Offer = Literal["subscription", "free", "ads", "rent", "buy"]
Gesture = Literal["nod", "shrug", "shiver", "excited", "bow"]
Country = Annotated[str, Field(pattern=r"^[A-Z]{2}$")]
FeatureKey = Annotated[str, Field(pattern=r"^(genre|keyword|person|decade|type|runtime):[a-z0-9_-]+$")]
ProfileId = Annotated[str, Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
TmdbId = Annotated[int, Field(gt=0)]

MAX_PROPOSALS_PER_CALL = 5


class ProviderOffer(CamelModel):
    provider_id: int
    name: str
    logo_url: HttpUrl
    offer: Offer


class TitleCard(CamelModel):
    tmdb_id: TmdbId
    type: TitleType
    name: str
    year: int | None
    overview: str
    rating: Annotated[float, Field(ge=0, le=10)] | None
    genres: list[str]
    runtime_minutes: Annotated[int, Field(gt=0)] | None
    poster_url: HttpUrl | None
    backdrop_url: HttpUrl | None
    trailer_key: str | None
    providers: list[ProviderOffer]
    on_my_services: bool


class WeightDelta(CamelModel):
    feature: FeatureKey
    delta: float


class WeightChange(CamelModel):
    change_id: Annotated[str, Field(min_length=1)]
    changes: Annotated[list[WeightDelta], Field(min_length=1)]
    reason: str
    at: AwareDatetime
    undone: bool


class WeightEntry(CamelModel):
    feature: FeatureKey
    label: str
    weight: float


class WeightsSummary(CamelModel):
    likes: list[WeightEntry]
    dislikes: list[WeightEntry]
    last_change: WeightChange | None


class Chip(CamelModel):
    id: Annotated[str, Field(min_length=1)]
    label: Annotated[str, Field(min_length=1)]


# Butler socket, app -> agent (contracts.md, section 3)


class SessionStartEvent(CamelModel):
    t: Literal["session.start"]
    profile_id: ProfileId
    country: Country
    services: list[int]
    has_mic: bool
    # The title on screen when the session starts, e.g. a taste pick after a fallback.
    current: TitleCard | None = None


class AudioStartEvent(CamelModel):
    t: Literal["audio.start"]
    format: Literal["pcm16"]
    sample_rate: Literal[16000]


class AudioEndEvent(CamelModel):
    t: Literal["audio.end"]


class ChipSelectEvent(CamelModel):
    t: Literal["chip.select"]
    chip_id: Annotated[str, Field(min_length=1)]


class SuggestionFeedbackEvent(CamelModel):
    t: Literal["suggestion.feedback"]
    tmdb_id: TmdbId
    type: TitleType
    kind: Literal["like", "skip", "watch_now"]


class SessionEndEvent(CamelModel):
    t: Literal["session.end"]


AppToAgentEvent = Annotated[
    SessionStartEvent | AudioStartEvent | AudioEndEvent | ChipSelectEvent | SuggestionFeedbackEvent | SessionEndEvent,
    Field(discriminator="t"),
]


# Butler socket, agent -> app


class TranscriptEvent(CamelModel):
    t: Literal["transcript"]
    text: str
    final: bool


class ThinkingEvent(CamelModel):
    t: Literal["thinking"]


class AnswerDeltaEvent(CamelModel):
    """Answer text as shown on screen: gesture markers are already stripped."""

    t: Literal["answer.delta"]
    text: str


class SpeechMark(CamelModel):
    time_ms: Annotated[int, Field(ge=0)]
    type: Literal["word", "sentence", "viseme"]
    value: str


class GestureCue(CamelModel):
    name: Gesture
    time_ms: Annotated[int, Field(ge=0)]


class SpeechEvent(CamelModel):
    """One per sentence. Audio is either at `audio_url` or in the binary frames that follow."""

    t: Literal["speech"]
    audio_url: HttpUrl | None = None
    format: Literal["mp3"]
    marks: list[SpeechMark]
    gestures: Annotated[list[GestureCue], Field(max_length=1)]


class SuggestionEvent(CamelModel):
    t: Literal["suggestion"]
    title: TitleCard
    reason: str


class ChipsEvent(CamelModel):
    t: Literal["chips"]
    chips: list[Chip]


class WeightsChangedEvent(CamelModel):
    t: Literal["weights.changed"]
    change: WeightChange


class AnswerDoneEvent(CamelModel):
    t: Literal["answer.done"]


class FallbackEvent(CamelModel):
    t: Literal["fallback"]
    reason: Literal["cap", "disabled", "error"]
    message: str
    chips: list[Chip]


AgentToAppEvent = Annotated[
    TranscriptEvent
    | ThinkingEvent
    | AnswerDeltaEvent
    | SpeechEvent
    | SuggestionEvent
    | ChipsEvent
    | WeightsChangedEvent
    | AnswerDoneEvent
    | FallbackEvent,
    Field(discriminator="t"),
]


# Agent tools (contracts.md, section 5)


class GetWeightsInput(CamelModel):
    profile_id: ProfileId


class UpdateWeightsInput(CamelModel):
    profile_id: ProfileId
    changes: Annotated[list[WeightDelta], Field(min_length=1)]
    reason: Annotated[str, Field(min_length=1)]


class UpdateWeightsOutput(CamelModel):
    change: WeightChange
    clamped: list[str]


class Proposal(CamelModel):
    title: Annotated[str, Field(min_length=1)]
    year: int | None
    type: TitleType


class ResolveTitlesInput(CamelModel):
    profile_id: ProfileId
    proposals: Annotated[list[Proposal], Field(min_length=1, max_length=MAX_PROPOSALS_PER_CALL)]


class DroppedProposal(CamelModel):
    proposal: Proposal
    reason: Literal["no_match", "not_on_my_services"]


class ResolveTitlesOutput(CamelModel):
    resolved: list[TitleCard]
    dropped: list[DroppedProposal]


class TitleRef(CamelModel):
    type: TitleType
    tmdb_id: TmdbId


# Titles the butler already showed in this visit: the tool never gives them again.
Exclude = Annotated[list[TitleRef], Field(max_length=50)]


class SimilarInput(CamelModel):
    profile_id: ProfileId
    type: TitleType
    tmdb_id: TmdbId
    count: Annotated[int, Field(gt=0)]
    exclude: Exclude | None = None


class RankedPicksInput(CamelModel):
    profile_id: ProfileId
    count: Annotated[int, Field(gt=0)]
    exclude: Exclude | None = None


class TitlesOutput(CamelModel):
    titles: list[TitleCard]


GetWeightsOutput = WeightsSummary
SimilarOutput = TitlesOutput
RankedPicksOutput = TitlesOutput


# Agent pipeline: voice -> brain -> gesture parser -> voice (contracts.md, section 7)


class TextInput(CamelModel):
    kind: Literal["text"]
    text: Annotated[str, Field(min_length=1)]


class ChipInput(CamelModel):
    kind: Literal["chip"]
    chip_id: Annotated[str, Field(min_length=1)]


BrainInput = Annotated[TextInput | ChipInput, Field(discriminator="kind")]


class BrainAnswerDelta(CamelModel):
    """Raw answer text from the brain, still holding the `{{gesture}}` markers."""

    t: Literal["answer.delta"]
    text: str


BrainEvent = Annotated[
    BrainAnswerDelta | SuggestionEvent | ChipsEvent | WeightsChangedEvent | AnswerDoneEvent | FallbackEvent,
    Field(discriminator="t"),
]


class SentenceCue(CamelModel):
    gesture: Gesture
    char_offset: Annotated[int, Field(ge=0)]


class CuedSentence(CamelModel):
    """One sentence after the gesture parser: clean text and at most one cue."""

    text: Annotated[str, Field(min_length=1)]
    cues: Annotated[list[SentenceCue], Field(max_length=1)]

    @model_validator(mode="after")
    def cues_inside_text(self) -> "CuedSentence":
        if any(cue.char_offset >= len(self.text) for cue in self.cues):
            raise ValueError("cue char_offset must point inside the sentence text")
        return self


app_to_agent_event = TypeAdapter(AppToAgentEvent)
agent_to_app_event = TypeAdapter(AgentToAppEvent)
brain_input = TypeAdapter(BrainInput)
brain_event = TypeAdapter(BrainEvent)
