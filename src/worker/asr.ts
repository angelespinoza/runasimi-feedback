import { MAX_RECORDING_SECONDS, SAMPLE_RATE, type SpeechLang } from '../config';
import { requirePipeline } from './models';

export type AsrResult = { text: string; truncated: boolean };

// audio: PCM mono a 16 kHz.
// El idioma se fija (no se autodetecta): whisper-base detecta mal el idioma en audios cortos o con acento.
export async function transcribe(audio: Float32Array, lang: SpeechLang = 'en'): Promise<AsrResult> {
  const maxSamples = MAX_RECORDING_SECONDS * SAMPLE_RATE;
  const truncated = audio.length > maxSamples;
  const input = truncated ? audio.subarray(0, maxSamples) : audio;

  const asr = requirePipeline('asr');
  const out = (await asr(input, {
    language: lang === 'es' ? 'spanish' : 'english',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  })) as { text: string };

  return { text: out.text.trim(), truncated };
}
