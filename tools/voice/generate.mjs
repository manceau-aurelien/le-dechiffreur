// Synthèse locale avec Kokoro. Appelé par tools/gen-audio.ts : node generate.mjs <jobs.json>
// Chaque tâche : { path, text, voice, speed }. Le fichier est écrit au fil de l'eau : une reprise ne refait rien.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join as joinPath } from 'node:path';
import { env } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';

// Un chemin court : sous Windows, le moteur ne sait pas ouvrir un modèle au-delà de 260 caractères.
env.cacheDir = joinPath(homedir(), '.cache', 'dechiffreur-voice');

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const SAMPLE_RATE = 24000;
const LEAD_SILENCE_S = 0.1; // certains téléphones avalent le tout début d'un son
const SENTENCE_PAUSE_S = 0.3;
const TARGET_PEAK = 0.9; // tous les clips au même niveau, assez fort pour un haut-parleur de téléphone
const SILENCE_LEVEL = 0.01;

/** WAV PCM 16 bits : le format que lisent tous les navigateurs de téléphone. */
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((x, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SAMPLE_RATE, 24);
  head.writeUInt32LE(SAMPLE_RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const silence = (seconds) => new Float32Array(Math.round(seconds * SAMPLE_RATE));

function join(parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Retire le silence autour d'une phrase, pour que seules nos pauses comptent. */
function trim(samples) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < SILENCE_LEVEL) start++;
  while (end > start && Math.abs(samples[end - 1]) < SILENCE_LEVEL) end--;
  const margin = Math.round(0.03 * SAMPLE_RATE);
  return samples.subarray(Math.max(0, start - margin), Math.min(samples.length, end + margin));
}

function normalize(samples) {
  const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (!peak) throw new Error('Clip silencieux');
  return samples.map((x) => (x * TARGET_PEAK) / peak);
}

// Phrase par phrase : le modèle tronque les textes longs, et la pause reste maîtrisée.
const sentences = (text) => text.split(/(?<=[.?!])\s+/).filter(Boolean);

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'cpu' });
const started = Date.now();
for (const [i, job] of jobs.entries()) {
  const parts = [silence(LEAD_SILENCE_S)];
  for (const [n, sentence] of sentences(job.text).entries()) {
    const { audio } = await tts.generate(sentence, { voice: job.voice, speed: job.speed });
    if (n > 0) parts.push(silence(SENTENCE_PAUSE_S));
    parts.push(trim(audio));
  }
  parts.push(silence(LEAD_SILENCE_S));
  mkdirSync(dirname(job.path), { recursive: true });
  writeFileSync(job.path, wav(normalize(join(parts))));
  if ((i + 1) % 20 === 0 || i === jobs.length - 1) console.log(`${i + 1}/${jobs.length} (${Math.round((Date.now() - started) / 1000)} s)`);
}
