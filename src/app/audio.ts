import { SAMPLE_RATE } from '../config';

// Decodifica cualquier audio que entienda el navegador (WAV, webm, Opus/OGG de WhatsApp)
// y lo remuestrea a PCM mono 16 kHz para Whisper.
export async function decodeTo16kMono(data: Blob | ArrayBuffer): Promise<Float32Array> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } finally {
    void ctx.close();
  }

  const length = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination); // mezcla a mono al conectar a 1 canal
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}
