// Produit le grondement de la porte (bruit grave synthétisé), le seul effet sonore du prototype.
import { writeFileSync } from 'node:fs';

const rate = 22050;
const seconds = 2.6;
const n = Math.floor(rate * seconds);
const pcm = Buffer.alloc(n * 2);
let low = 0;
let seed = 12345;
for (let i = 0; i < n; i++) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  const noise = seed / 0x3fffffff - 1;
  low += (noise - low) * 0.02;
  const t = i / n;
  const env = Math.min(1, t * 4) * Math.pow(1 - t, 1.4);
  const wobble = 0.75 + 0.25 * Math.sin(2 * Math.PI * 7 * (i / rate));
  const sample = Math.max(-1, Math.min(1, low * 7 * env * wobble));
  pcm.writeInt16LE(Math.round(sample * 30000), i * 2);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0);
h.writeUInt32LE(36 + pcm.length, 4);
h.write('WAVEfmt ', 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(1, 22);
h.writeUInt32LE(rate, 24);
h.writeUInt32LE(rate * 2, 28);
h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34);
h.write('data', 36);
h.writeUInt32LE(pcm.length, 40);
writeFileSync('assets/audio/sfx-door.wav', Buffer.concat([h, pcm]));
console.log('gen-sfx : assets/audio/sfx-door.wav');
