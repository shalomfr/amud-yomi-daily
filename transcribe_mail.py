# מתמלל (Whisper בעברית) את ההקלטות החדשות בשלוחה 1 של הקו ושולח אותן למייל במיילים מסוכמים.
# הריפו ציבורי ויומני הריצה ציבוריים — לכן הסקריפט לעולם לא מדפיס תמלול, מספרי טלפון או שמות; רק ספירות.
# שימוש: python transcribe_mail.py [--limit N] [--chunk 20]
import argparse, html, json, os, sys, tempfile, time, traceback
from pathlib import Path

import wave

import numpy as np
import requests

FOLDER = 'ivr2:/1'
STATE = Path(__file__).with_name('state') / 'processed.json'
MODEL = 'ivrit-ai/whisper-large-v3-turbo-ct2'
MAIL_TO = os.environ.get('MAIL_TO', 'b0527624748@gmail.com')
MAIL_FROM = os.environ.get('MAIL_FROM', 'תמלולי הקו <transcripts@mail.kashrifreelancer.com>')
YEMOT = 'https://www.call2all.co.il/ym/api'
TOKEN = f"{os.environ['YEMOT_USER']}:{os.environ['YEMOT_PASS']}"


def list_recordings():
    r = requests.get(f'{YEMOT}/GetIVR2Dir', params={'token': TOKEN, 'path': FOLDER}, timeout=60)
    r.raise_for_status()
    files = [f for f in r.json().get('files', []) if f['name'].lower().endswith('.wav') and f['name'][:-4].isdigit()]
    return sorted(files, key=lambda f: int(f['name'][:-4]))


def download(f, dest):
    r = requests.get(f'{YEMOT}/DownloadFile', params={'token': TOKEN, 'path': f['what']}, timeout=120)
    r.raise_for_status()
    Path(dest).write_bytes(r.content)


def load_audio(path):
    """wav של ימות (PCM 16-bit, 8kHz) -> float32 ב-16kHz, בלי ספריית av."""
    with wave.open(str(path), 'rb') as w:
        sr, ch = w.getframerate(), w.getnchannels()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if sr != 16000:
        n = int(len(a) * 16000 / sr)
        a = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)
    return a


def fmt_phone(p):
    return p if p else 'לא ידוע'


def build_html(items, part, parts):
    rows = []
    for it in items:
        f, text = it['file'], it['text']
        head = f"הקלטה {f['name'][:-4]} · {f.get('date') or f.get('mtime')} · מספר: {fmt_phone(f.get('phone'))} · {f.get('durationStr', '')}"
        body = html.escape(text).replace('\n', '<br>') if text else '<i>(לא זוהה דיבור)</i>'
        rows.append(f"<div style='margin:0 0 22px;padding:12px;border-right:4px solid #2b6cb0;background:#f7fafc'>"
                    f"<div style='color:#555;font-size:13px;margin-bottom:6px'>{html.escape(head)}</div>"
                    f"<div style='font-size:16px;line-height:1.7'>{body}</div></div>")
    title = 'תמלול הקלטות מהקו' + (f' (חלק {part} מתוך {parts})' if parts > 1 else '')
    return f"<div dir='rtl' style='font-family:Arial,sans-serif;max-width:720px'><h2>{title}</h2>{''.join(rows)}</div>", title


def send_mail(subject, body_html):
    r = requests.post('https://api.resend.com/emails', timeout=120,
                      headers={'Authorization': f"Bearer {os.environ['RESEND_API_KEY']}"},
                      json={'from': MAIL_FROM, 'to': [MAIL_TO], 'subject': subject, 'html': body_html})
    if not r.ok:
        raise RuntimeError(f'resend {r.status_code}')  # בלי גוף התשובה, כדי לא לחשוף פרטים ביומן


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='מקסימום הקלטות בריצה (0 = הכול)')
    ap.add_argument('--chunk', type=int, default=20, help='כמה הקלטות בכל מייל')
    args = ap.parse_args()

    done = set(json.loads(STATE.read_text('utf-8'))) if STATE.exists() else set()
    todo = [f for f in list_recordings() if f['uniqueId'] not in done]
    if args.limit:
        todo = todo[:args.limit]
    print(f'הקלטות חדשות לתמלול: {len(todo)}')
    if not todo:
        return

    from faster_whisper import WhisperModel
    model = WhisperModel(MODEL, device='cpu', compute_type='int8')
    chunks = [todo[i:i + args.chunk] for i in range(0, len(todo), args.chunk)]
    for ci, chunk in enumerate(chunks, 1):
        items = []
        for f in chunk:
            t0 = time.time()
            try:
                with tempfile.TemporaryDirectory() as td:
                    p = Path(td) / 'a.wav'
                    download(f, p)
                    segs, _ = model.transcribe(load_audio(p), language='he', vad_filter=True, beam_size=5)
                    text = ' '.join(s.text.strip() for s in segs).strip()
                items.append({'file': f, 'text': text})
                print(f"  הקלטה {f['name'][:-4]}: {round(f.get('duration') or 0)} שניות הוקלטו, תומללו ב-{round(time.time() - t0)} שניות")
            except Exception as e:  # לא מדפיסים פרטים; ההקלטה תנוסה שוב בריצה הבאה
                print(f"  הקלטה {f['name'][:-4]}: נכשלה ({type(e).__name__})")
                print('   ', ' | '.join(traceback.format_exc().splitlines()[-4:]), flush=True)  # קוד ושגיאה בלבד, לא תוכן
        if not items:
            continue
        body, title = build_html(items, ci, len(chunks))
        send_mail(f"{title} · {len(items)} הקלטות", body)
        done.update(it['file']['uniqueId'] for it in items)
        STATE.parent.mkdir(exist_ok=True)
        STATE.write_text(json.dumps(sorted(done)), 'utf-8')  # נשמר אחרי כל מייל — ריצה שנקטעה ממשיכה משם
        print(f'נשלח מייל {ci}/{len(chunks)} ({len(items)} הקלטות)')


if __name__ == '__main__':
    main()
