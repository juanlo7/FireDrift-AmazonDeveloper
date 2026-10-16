import type { MicStream, OpenMic } from './pushToTalk';

const MIC_PRIVILEGE = 'com.amazon.audio.privilege.microphone.access';
/** 100 ms of 16 kHz, 16 bit, mono, when the stream does not report its minimum buffer. */
const READ_BYTES = 3200;

/**
 * Opens the Vega microphone as PCM 16 kHz mono 16 bit (spike V2). Resolves
 * `null` on any failure (no device, no permission, a stream that cannot be
 * read): the butler then works with chips only.
 */
export const openVegaMic: OpenMic = async () => {
  try {
    // Loaded on first use: the native modules exist only on Vega.
    const audio = require('@amazon-devices/keplerscript-audio-lib');
    const { SecurityManager } = require('@amazon-devices/security-manager-lib');
    const state = await SecurityManager.requestPrivilege(MIC_PRIVILEGE);
    if (String(state).toUpperCase() !== 'ALLOW') return null;

    const builder = new audio.AudioRecordStreamBuilder();
    builder.setAudioConfig({
      sampleRate: audio.AudioSampleRate.SAMPLE_RATE_16_KHZ,
      channelMask: audio.AudioChannelMask.CHANNEL_MONO,
      format: audio.AudioSampleFormat.FORMAT_PCM_16_BIT,
    });
    builder.setAudioSource(audio.AudioSource.VOICE_RECOGNITION);
    const stream = await builder.buildAsync();
    const destroy = () => audio.AudioRecordStreamBuilder.destroyAsync(stream);
    // On the VVD the stream builds but is not usable (initCheck -3).
    if ((await stream.initCheckAsync()) !== 0) {
      await destroy().catch(() => undefined);
      return null;
    }
    const minBytes = await stream.getMinBufferSizeInBytesAsync();
    const bytes = minBytes > 0 ? minBytes : READ_BYTES;
    return { read: () => stream.readAsync(bytes), close: destroy };
  } catch (cause) {
    console.warn('[butler] no microphone', cause);
    return null;
  }
};

/**
 * A microphone that hears silence, for the offline butler (`butlerMode: 'fake'`)
 * on a device with no audio input, so push to talk can be tried end to end.
 */
export const openSilentMic: OpenMic = async (): Promise<MicStream> => ({
  read: () => new Promise(resolve => setTimeout(() => resolve(new ArrayBuffer(READ_BYTES)), 100)),
  close: async () => undefined,
});
