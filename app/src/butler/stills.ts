import type { ImageSourcePropType } from 'react-native';
import type { ClipName } from './clips';

/** The first frame of each clip (`assets/butler/stills/`), shown while the clip starts. */
export const CLIP_STILLS: Record<ClipName, ImageSourcePropType> = {
  idle: require('../../assets/butler/stills/idle.jpg'),
  listening: require('../../assets/butler/stills/listening.jpg'),
  thinking: require('../../assets/butler/stills/thinking.jpg'),
  speaking: require('../../assets/butler/stills/speaking.jpg'),
  'gesture-nod': require('../../assets/butler/stills/gesture-nod.jpg'),
  'gesture-shrug': require('../../assets/butler/stills/gesture-shrug.jpg'),
  'gesture-shiver': require('../../assets/butler/stills/gesture-shiver.jpg'),
  'gesture-excited': require('../../assets/butler/stills/gesture-excited.jpg'),
  'gesture-bow': require('../../assets/butler/stills/gesture-bow.jpg'),
};
