// מרכיב את הודעת התפריט של השלוחה הראשית: [תאריך + עמוד יומי בקריינות מחשב] + [התפריט המקורי],
// ומעלה אותה לימות המשיח כ-M1000.wav. להרצה יומית אחרי חצות.
// שימוש:  node update-opening.mjs [--dry] [YYYY-MM-DD]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openingText } from './amud.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const work = join(dir, 'work');
const env = Object.fromEntries(
  readFileSync(join(dir, '.env'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => l.split(/=(.*)/s).slice(0, 2)));
const token = `${env.YEMOT_USER}:${env.YEMOT_PASS}`;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dateArg = args.find(a => /^\d{4}-\d\d-\d\d$/.test(a));
const text = openingText(dateArg ? new Date(`${dateArg}T12:00:00+03:00`) : new Date());
console.log('טקסט:', text);

// התפריט המקורי נשמר בימות כ-M1000-base.wav (לא עולה לריפו). מורידים אותו בכל ריצה.
mkdirSync(work, { recursive: true });
const orig = join(work, 'M1000.orig.wav');
const dl = await fetch(`https://www.call2all.co.il/ym/api/DownloadFile?token=${token}&path=ivr2:/M1000-base.wav`);
if (!dl.ok) throw new Error(`הורדת M1000-base.wav נכשלה: ${dl.status}`);
writeFileSync(orig, Buffer.from(await dl.arrayBuffer()));

const mp3 = join(work, 'tts.mp3');
const spoken = join(work, 'tts.wav');
const out = join(work, 'M1000.new.wav');
execFileSync('python', ['-I', '-m', 'edge_tts', '--voice', 'he-IL-AvriNeural', '--text', text, '--write-media', mp3], { stdio: 'inherit' });
// 8kHz מונו PCM כמו ההקלטות במערכת, עם שקט קצר לפני ואחרי
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-af', 'adelay=300:all=1,apad=pad_dur=0.5', '-ar', '8000', '-ac', '1', '-c:a', 'pcm_s16le', spoken]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', spoken, '-i', orig, '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1', '-ar', '8000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
console.log('נוצר', out);

if (dry) process.exit(0);

const form = new FormData();
form.set('token', token);
form.set('path', 'ivr2:/M1000.wav');
form.set('convertAudio', '0');
form.set('upfile', new Blob([readFileSync(out)], { type: 'audio/wav' }), 'M1000.wav');
const res = await fetch('https://www.call2all.co.il/ym/api/UploadFile', { method: 'POST', body: form });
const body = await res.json();
console.log('תשובת ימות:', JSON.stringify(body));
if (body.responseStatus !== 'OK') process.exit(1);
