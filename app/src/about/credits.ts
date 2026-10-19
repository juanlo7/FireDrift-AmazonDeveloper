/**
 * Credits on the About screen. Keep them true: add every AI tool, asset and
 * open-source library that ships with the app or the butler (#37, docs/requirements.md §8).
 */

export const TMDB_NOTICE = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

export const JUSTWATCH_CREDIT = 'Streaming availability data provided by JustWatch, through TMDB.';

/** AI services and tools behind the butler, and where its character comes from. */
export const BUTLER_CREDITS: { what: string; how: string }[] = [
  { what: 'Conversation', how: 'Claude Haiku 4.5 (fallback Amazon Nova 2 Lite) on Amazon Bedrock' },
  { what: 'Agent', how: 'Strands Agents on Amazon Bedrock AgentCore' },
  { what: 'Voice', how: 'Amazon Polly neural voices' },
  { what: 'Listening', how: 'Amazon Transcribe streaming; audio is never stored' },
  { what: 'Character', how: 'Modeled, rigged and animated by the team in Blender, with AI-assisted bpy scripts' },
];

/** Open-source code in the app. FireDrift itself is MIT licensed. */
export const OPEN_SOURCE: { name: string; license: string }[] = [
  { name: 'React and React Native', license: 'MIT' },
  { name: 'React Navigation', license: 'MIT' },
  { name: 'react-native-screens', license: 'MIT' },
  { name: 'react-native-safe-area-context', license: 'MIT' },
  { name: 'React Native Async Storage', license: 'MIT' },
  { name: 'Focus helpers adapted from vega-tv-interfaces-sample (Amazon)', license: 'MIT-0' },
  { name: 'Big Shoulders Display and Figtree fonts', license: 'SIL OFL 1.1' },
  { name: 'FireDrift', license: 'MIT' },
];
