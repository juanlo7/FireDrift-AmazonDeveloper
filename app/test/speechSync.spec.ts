import { createSpeechSync, LAST_WORD_MS } from '../src/butler/speechSync';

const speech = require('@firedrift/domain/fixtures/socket/agent-to-app/speech.json');

describe('speech sync', () => {
  it('talks from the first word until just after the last one', () => {
    const sync = createSpeechSync({
      marks: [
        { timeMs: 0, type: 'sentence', value: 'Hi there.' },
        { timeMs: 120, type: 'word', value: 'Hi' },
        { timeMs: 400, type: 'word', value: 'there' },
        { timeMs: 150, type: 'viseme', value: 'a' },
      ],
      gestures: [],
    });
    expect(sync.at(50).talking).toBe(false);
    expect(sync.at(120).talking).toBe(true);
    expect(sync.at(400 + LAST_WORD_MS - 1).talking).toBe(true);
    expect(sync.at(400 + LAST_WORD_MS).talking).toBe(false);
  });

  it('plays each gesture once, when the audio reaches its time', () => {
    const sync = createSpeechSync({
      marks: [],
      gestures: [{ name: 'shiver', timeMs: 300 }],
    });
    expect(sync.at(299).gestures).toEqual([]);
    expect(sync.at(320).gestures).toEqual(['shiver']);
    expect(sync.at(900).gestures).toEqual([]);
  });

  it('reads the speech fixture', () => {
    const sync = createSpeechSync(speech);
    const atEnd = sync.at(60_000);
    expect(atEnd.gestures).toEqual(speech.gestures.map((g: { name: string }) => g.name));
    expect(atEnd.talking).toBe(false);
  });

  it('never talks without word marks', () => {
    expect(createSpeechSync({ marks: [], gestures: [] }).at(0).talking).toBe(false);
  });
});
