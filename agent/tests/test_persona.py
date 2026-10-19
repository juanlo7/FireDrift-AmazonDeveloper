import re

from brain.brain import HERE, system_prompt
from brain.chips import MAX_REPLIES, MAX_REPLY_CHARS, ReplyExtractor
from character.cues import GESTURES, MAX_CUES_PER_ANSWER, CueParser

PERSONA = (HERE / "persona.md").read_text()
EXAMPLES = re.findall(r"^Butler: (.+)$", PERSONA, flags=re.MULTILINE)


def test_system_prompt_lists_the_full_gesture_set_and_the_limits():
    prompt = system_prompt()
    listed = re.findall(r"^- \{\{(\w+)\}\}", prompt, flags=re.MULTILINE)
    assert set(listed) == GESTURES and len(listed) == len(GESTURES)
    assert "one gesture per sentence" in prompt
    assert "two per answer" in prompt and MAX_CUES_PER_ANSWER == 2


def test_persona_asks_for_reply_markers_within_the_code_limits():
    assert "{{reply: " in PERSONA
    assert "two or three short replies" in PERSONA and MAX_REPLIES == 3
    assert f"under {MAX_REPLY_CHARS} characters" in PERSONA


def test_examples_are_speakable():
    assert len(EXAMPLES) >= 3
    for example in EXAMPLES:
        assert not re.search(r"[*#_()\[\]&%]|[^\x00-\x7f]", example)


def test_examples_pass_the_parser_with_valid_gestures_in_the_limits():
    for example in EXAMPLES:
        used = re.findall(r"\{\{\s*(\w*)\s*\}\}", example)
        assert set(used) <= GESTURES
        assert len(used) <= MAX_CUES_PER_ANSWER

        replies = ReplyExtractor()
        spoken = replies.feed(example + " ") + replies.flush()
        assert len(replies.replies) == example.count("{{reply:")
        parser = CueParser()
        sentences = parser.feed(spoken) + parser.flush()
        assert 1 <= len(sentences) <= 3
        assert all("{" not in s.text for s in sentences)
        assert all(len(s.cues) <= 1 for s in sentences)
        assert sum(len(s.cues) for s in sentences) == len(used)
