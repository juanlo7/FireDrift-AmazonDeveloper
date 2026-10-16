from character.cues import CueParser
from voice.polly import gesture_times


def parse(*chunks: str):
    parser = CueParser()
    out = [s for chunk in chunks for s in parser.feed(chunk)] + parser.flush()
    return [(s.text, [(c.gesture, c.char_offset) for c in s.cues]) for s in out]


def test_a_cue_points_at_the_word_after_its_marker():
    assert parse("Then try this one. {{shiver}} It is creepy, but not {{nod}}gory.") == [
        ("Then try this one.", []),
        ("It is creepy, but not gory.", [("shiver", 0)]),
    ]
    assert parse("That one is {{shiver}} creepy.") == [("That one is creepy.", [("shiver", 12)])]


def test_markers_are_never_shown_even_unknown_or_extra_ones():
    out = parse("{{wave}} Hello {{ NOD }} there. {{bow}} Bye {{excited}} now. {{shrug}} Done.")
    assert out == [
        ("Hello there.", [("nod", 6)]),
        ("Bye now.", [("bow", 0)]),
        ("Done.", []),
    ]
    assert all("{" not in text for text, _ in out)


def test_markers_split_across_chunks_still_parse():
    assert parse("Here. {{shi", "ver}} Boo", "! ") == [("Here.", []), ("Boo!", [("shiver", 0)])]


def test_a_marker_before_punctuation_or_at_the_end_stays_inside_the_text():
    assert parse("It is creepy {{shiver}}.") == [("It is creepy.", [("shiver", 12)])]
    assert parse("Enjoy it {{bow}}") == [("Enjoy it", [("bow", 7)])]
    assert parse("Enjoy! {{bow}}") == [("Enjoy!", [])]


def test_markdown_and_titles_are_handled_like_the_splitter():
    assert parse("{{excited}} Watch **Dr. Strange** tonight. ") == [("Watch Dr. Strange tonight.", [("excited", 0)])]


def test_cues_get_the_time_of_the_polly_word_they_sit_before():
    (sentence,) = CueParser().feed("Then {{shiver}} it gets creepy. ")
    marks = [
        {"time": 0, "type": "word", "start": 0, "value": "Then"},
        {"time": 310, "type": "word", "start": 5, "value": "it"},
        {"time": 480, "type": "word", "start": 8, "value": "gets"},
    ]
    assert [(c.name, c.time_ms) for c in gesture_times(sentence, marks)] == [("shiver", 310)]
