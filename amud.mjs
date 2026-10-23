// חישוב העמוד היומי של 'דרשו' + תאריך עברי, והפקת טקסט להקראה.
// עוגן (מאומת מול לוח דרשו תשפ"ו): 8 בחשון תשפ"ז = יום ב' 2026-10-19 = סוכה ב' עמוד א.
// מכאן כל יום (כולל שבת) = עמוד אחד, ברצף של סדר הש"ס.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ANCHOR = { date: '2026-10-19', masechet: 'סוכה', daf: 2, amud: 'א' };

// [שם, הדף האחרון, עמוד אחרון] — מסכתות הש"ס הבבלי. כולם מתחילות בדף ב' עמוד א.
const SHAS = [
  ['שבת', 157, 'ב'], ['עירובין', 105, 'א'], ['פסחים', 121, 'ב'], ['שקלים', 22, 'ב'], ['יומא', 88, 'א'],
  ['סוכה', 56, 'ב'], ['ביצה', 40, 'ב'], ['ראש השנה', 35, 'א'], ['תענית', 31, 'א'],
  ['מגילה', 32, 'א'], ['מועד קטן', 29, 'א'], ['חגיגה', 27, 'א'],
  ['יבמות', 122, 'ב'], ['כתובות', 112, 'ב'], ['נדרים', 91, 'ב'], ['נזיר', 66, 'ב'],
  ['סוטה', 49, 'ב'], ['גיטין', 90, 'ב'], ['קידושין', 82, 'ב'],
  ['בבא קמא', 119, 'ב'], ['בבא מציעא', 119, 'א'], ['בבא בתרא', 176, 'ב'],
  ['סנהדרין', 113, 'ב'], ['מכות', 24, 'ב'], ['שבועות', 49, 'ב'], ['עבודה זרה', 76, 'ב'],
  ['הוריות', 14, 'א'], ['זבחים', 120, 'ב'], ['מנחות', 110, 'א'], ['חולין', 142, 'א'],
  ['בכורות', 61, 'א'], ['ערכין', 34, 'א'], ['תמורה', 34, 'א'], ['כריתות', 28, 'ב'],
  ['מעילה', 22, 'א'], ['תמיד', 33, 'ב'], ['נידה', 73, 'א'],
];

// רשימה שטוחה של כל העמודים בסדר: {masechet, daf, amud}
const PAGES = [];
for (const [name, lastDaf, lastAmud] of SHAS) {
  for (let d = 2; d <= lastDaf; d++) {
    PAGES.push({ masechet: name, daf: d, amud: 'א' });
    if (d < lastDaf || lastAmud === 'ב') PAGES.push({ masechet: name, daf: d, amud: 'ב' });
  }
}
const anchorIndex = PAGES.findIndex(
  p => p.masechet === ANCHOR.masechet && p.daf === ANCHOR.daf && p.amud === ANCHOR.amud);

const DAYS = ['רִאשׁוֹן', 'שֵׁנִי', 'שְׁלִישִׁי', 'רְבִיעִי', 'חֲמִישִׁי', 'שִׁשִּׁי'];
// מנוקד ועם מילת היחס "ב" כבר בפנים, כי הניקוד של ה-ב משתנה לפי החודש.
const MONTHS = {
  Tishri: 'בְּתִשְׁרֵי', Heshvan: 'בְּחֶשְׁוָן', Kislev: 'בְּכִסְלֵו', Tevet: 'בְּטֵבֵת', Shevat: 'בִּשְׁבָט',
  Adar: 'בַּאֲדָר', 'Adar I': 'בַּאֲדָר רִאשׁוֹן', 'Adar II': 'בַּאֲדָר שֵׁנִי', Nisan: 'בְּנִיסָן',
  Iyar: 'בְּאִיָּיר', Sivan: 'בְּסִיוָן', Tamuz: 'בְּתַמּוּז', Av: 'בְּאָב', Elul: 'בֶּאֱלוּל',
};

function israelYmd(now) {
  // YYYY-MM-DD לפי שעון ישראל
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

export function amudFor(now = new Date()) {
  const ymd = israelYmd(now);
  const days = Math.round((Date.parse(ymd) - Date.parse(ANCHOR.date)) / 86400000);
  const page = PAGES[anchorIndex + days];
  if (!page) throw new Error(`התאריך ${ymd} מחוץ לטווח הש"ס שהוגדר`);
  return { ymd, ...page };
}

export function hebrewDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', {
    timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long',
  }).formatToParts(now);
  const day = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  if (!MONTHS[month]) throw new Error(`חודש עברי לא מוכר: ${month}`);
  return { day, month: MONTHS[month] };
}

// מספר (1–199) באותיות עבריות (גימטריה): 4 → ד׳, 12 → י״ב, 15 → ט״ו, 16 → ט״ז.
export function gematria(n) {
  if (n >= 200 || n < 1) throw new Error(`מספר מחוץ לטווח: ${n}`);
  const HUNDREDS = ['', 'ק'];
  const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  let r = HUNDREDS[Math.floor(n / 100)];
  const rest = n % 100;
  if (rest === 15) r += 'טו';
  else if (rest === 16) r += 'טז';
  else r += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  return r.length === 1 ? `${r}׳` : `${r.slice(0, -1)}״${r.slice(-1)}`;
}

// להקראה: כל אות בשמה (ד -> "דלת", י״ב -> "יוד בית"), כי הקריין לא מבין גימטריה.
const LETTER_NAMES = {
  א: 'אָלֶף', ב: 'בֵּית', ג: 'גִּימֶל', ד: 'דָּלֶת', ה: 'הֵא', ו: 'וָו', ז: 'זַיִן', ח: 'חֵית', ט: 'טֵית',
  י: 'יוֹד', כ: 'כַּף', ל: 'לָמֶד', מ: 'מֵם', נ: 'נוּן', ס: 'סָמֶךְ', ע: 'עַיִן', פ: 'פֵּא', צ: 'צָדִי', ק: 'קוֹף',
};

// שמות המסכתות מנוקדים להקראה
const MASECHET_NIKUD = {
  'שבת': 'שַׁבָּת', 'עירובין': 'עֵרוּבִין', 'פסחים': 'פְּסָחִים', 'שקלים': 'שְׁקָלִים', 'יומא': 'יוֹמָא', 'סוכה': 'סֻכָּה',
  'ביצה': 'בֵּיצָה', 'ראש השנה': 'רֹאשׁ הַשָּׁנָה', 'תענית': 'תַּעֲנִית', 'מגילה': 'מְגִלָּה',
  'מועד קטן': 'מוֹעֵד קָטָן', 'חגיגה': 'חֲגִיגָה', 'יבמות': 'יְבָמוֹת', 'כתובות': 'כְּתוּבּוֹת',
  'נדרים': 'נְדָרִים', 'נזיר': 'נָזִיר', 'סוטה': 'סוֹטָה', 'גיטין': 'גִּטִּין', 'קידושין': 'קִדּוּשִׁין',
  'בבא קמא': 'בָּבָא קַמָּא', 'בבא מציעא': 'בָּבָא מְצִיעָא', 'בבא בתרא': 'בָּבָא בַּתְרָא',
  'סנהדרין': 'סַנְהֶדְרִין', 'מכות': 'מַכּוֹת', 'שבועות': 'שְׁבוּעוֹת', 'עבודה זרה': 'עֲבוֹדָה זָרָה',
  'הוריות': 'הוֹרָיוֹת', 'זבחים': 'זְבָחִים', 'מנחות': 'מְנָחוֹת', 'חולין': 'חֻלִּין', 'בכורות': 'בְּכוֹרוֹת',
  'ערכין': 'עֲרָכִין', 'תמורה': 'תְּמוּרָה', 'כריתות': 'כְּרִיתוֹת', 'מעילה': 'מְעִילָה', 'תמיד': 'תָּמִיד',
  'נידה': 'נִדָּה',
};
export const spelled = n => [...gematria(n).replace(/[׳״]/g, '')].map(c => LETTER_NAMES[c]).join(' ');

export function openingText(now = new Date()) {
  const wd = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getDay();
  const dayName = wd === 6 ? 'שַׁבָּת קֹדֶשׁ' : `יוֹם ${DAYS[wd]}`;
  const { day, month } = hebrewDate(now);
  const { masechet, daf, amud } = amudFor(now);
  return `${dayName}, ${spelled(Number(day))} ${month}. הָעַמּוּד הַיּוֹמִי: ${MASECHET_NIKUD[masechet]}, דַּף ${spelled(daf)}, עַמּוּד ${LETTER_NAMES[amud]}.`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = process.argv[2];
  console.log(openingText(arg ? new Date(arg + 'T12:00:00+03:00') : new Date()));
}
