// Génère les clips audio et le manifeste. Seuls les clips nouveaux ou modifiés sont produits.
//   npm run gen:audio -- --provider kokoro  voix neuronales locales et gratuites (cd tools/voice && npm install)
//   npm run gen:audio -- --provider sapi    voix Windows locales, peu compréhensibles
//   npm run gen:audio -- --provider azure   voix neuronales (AZURE_SPEECH_KEY et AZURE_SPEECH_REGION)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { listClips, loadContent, type ClipRequest } from './lib.ts';

interface Job {
  clip: ClipRequest;
  file: string;
}

const flag = process.argv.indexOf('--provider');
const provider = flag >= 0 ? process.argv[flag + 1] : 'kokoro';
if (provider !== 'kokoro' && provider !== 'sapi' && provider !== 'azure') throw new Error(`Fournisseur inconnu : ${provider}`);
const voices = JSON.parse(readFileSync('content/voices.json', 'utf8'));
const OUT = join('assets', 'audio');
const EXT = provider === 'azure' ? 'mp3' : 'wav';
mkdirSync(OUT, { recursive: true });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Une courte pause entre les phrases d'une même réplique. */
const body = (clip: ClipRequest) => clip.ssmlOverride ?? esc(clip.text).replace(/([.?!]) (?=\S)/g, '$1 <break time="300ms"/> ');

function ssml(clip: ClipRequest, voiceName: string, pitch: string) {
  const rate = clip.slow ? '-30%' : 'default';
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voiceName}"><prosody rate="${rate}" pitch="${pitch}">${body(clip)}</prosody></voice></speak>`;
}

function fileFor(clip: ClipRequest) {
  const v = voices[clip.voice];
  const voiceKey = provider === 'azure' ? v.azure : JSON.stringify(provider === 'kokoro' ? v.kokoro : v.sapi);
  const hash = createHash('sha1')
    .update([provider, clip.text, voiceKey, clip.slow, clip.ssmlOverride ?? ''].join('|'))
    .digest('hex')
    .slice(0, 16);
  return `${hash}.${EXT}`;
}

async function genAzure(jobs: Job[]) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY et AZURE_SPEECH_REGION sont requis');
  for (const { clip, file } of jobs) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'le-dechiffreur-gen-audio',
      },
      body: ssml(clip, voices[clip.voice].azure, 'default'),
    });
    if (!res.ok) throw new Error(`Azure ${res.status} sur ${clip.clipId} : ${await res.text()}`);
    writeFileSync(join(OUT, file), Buffer.from(await res.arrayBuffer()));
  }
}

/** Le ralenti : assez net pour distinguer chaque mot, sans casser la voix. */
const KOKORO_SLOW_FACTOR = 0.78;

function genKokoro(jobs: Job[]) {
  const tool = join('tools', 'voice');
  if (!existsSync(join(tool, 'node_modules'))) throw new Error('Installe d’abord l’outil : cd tools/voice && npm install');
  const list = jobs.map(({ clip, file }) => {
    if (clip.ssmlOverride) throw new Error(`Kokoro ne lit pas le SSML : ${clip.clipId}`);
    const { voice, speed } = voices[clip.voice].kokoro;
    return { path: resolve(OUT, file), text: clip.text, voice, speed: clip.slow ? speed * KOKORO_SLOW_FACTOR : speed };
  });
  const tmp = join(tmpdir(), `gen-audio-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  const listPath = join(tmp, 'jobs.json');
  writeFileSync(listPath, JSON.stringify(list), 'utf8');
  execFileSync('node', ['generate.mjs', listPath], { cwd: tool, stdio: 'inherit' });
  rmSync(tmp, { recursive: true, force: true });
}

function genSapi(jobs: Job[]) {
  const tmp = join(tmpdir(), `gen-audio-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  const list = jobs.map(({ clip, file }) => ({
    path: resolve(OUT, file),
    ssml: ssml(clip, voices[clip.voice].sapi.name, voices[clip.voice].sapi.pitch),
  }));
  const listPath = join(tmp, 'jobs.json');
  writeFileSync(listPath, JSON.stringify(list), 'utf8');
  const script = `
Add-Type -AssemblyName System.Speech
$jobs = Get-Content -Raw -Encoding UTF8 '${listPath.replace(/'/g, "''")}' | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($job in $jobs) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SetOutputToWaveFile($job.path, $fmt)
  $s.SpeakSsml($job.ssml)
  $s.Dispose()
}`;
  const scriptPath = join(tmp, 'gen.ps1');
  writeFileSync(scriptPath, '﻿' + script, 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { stdio: 'inherit' });
  rmSync(tmp, { recursive: true, force: true });
}

const clips = listClips(loadContent());
const planned: Job[] = clips.map((clip) => ({ clip, file: fileFor(clip) }));
const missing = planned.filter(({ file }) => !existsSync(join(OUT, file)));
console.log(`gen-audio (${provider}) : ${clips.length} clips, ${missing.length} à générer`);
if (missing.length) {
  if (provider === 'azure') await genAzure(missing);
  else if (provider === 'kokoro') genKokoro(missing);
  else genSapi(missing);
}

// Retire les fichiers qui ne sont plus référencés, sauf les effets sonores.
const used = new Set(planned.map((p) => p.file));
for (const f of readdirSync(OUT)) if (!used.has(f) && !f.startsWith('sfx-')) rmSync(join(OUT, f));

const lines = planned.map(({ clip, file }) => `  ${JSON.stringify(clip.clipId)}: require('../../assets/audio/${file}'),`);
writeFileSync(
  'src/audio/audio-manifest.ts',
  `// Fichier généré par tools/gen-audio.ts. Ne pas modifier à la main.\nexport const AUDIO_PROVIDER: string = '${provider}';\nexport const clips: Record<string, number> = {\n${lines.join('\n')}\n  "sfx:door": require('../../assets/audio/sfx-door.wav'),\n};\n`,
);
console.log('gen-audio : manifeste écrit');
