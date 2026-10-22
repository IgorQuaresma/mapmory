import type { Interpretation, Mood } from '@mapmory/design-schema';
import { normalizeInterpretation } from './schema';
import type { InterpretationProvider } from './provider';

/**
 * Non-LLM fallback (plan §9): regex dates, preposition-based place phrases and keyword moods.
 * Good enough to pre-fill the place step; the user always confirms the location.
 */
const MONTHS: Record<string, number> = {};
[
  ['january', 'januar', 'janeiro', 'janvier', 'enero', 'jan'],
  ['february', 'februar', 'fevereiro', 'février', 'febrero', 'feb', 'fev'],
  ['march', 'märz', 'marz', 'março', 'mars', 'marzo', 'mar'],
  ['april', 'abril', 'avril', 'apr', 'abr'],
  ['may', 'mai', 'maio', 'mayo'],
  ['june', 'juni', 'junho', 'juin', 'junio', 'jun'],
  ['july', 'juli', 'julho', 'juillet', 'julio', 'jul'],
  ['august', 'agosto', 'août', 'aout', 'aug', 'ago'],
  ['september', 'setembro', 'septembre', 'septiembre', 'sep', 'sept', 'set'],
  ['october', 'oktober', 'outubro', 'octobre', 'octubre', 'oct', 'okt', 'out'],
  ['november', 'novembro', 'novembre', 'noviembre', 'nov'],
  ['december', 'dezember', 'dezembro', 'décembre', 'diciembre', 'dec', 'dez'],
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const pad = (n: number) => String(n).padStart(2, '0');

export function extractDate(text: string): Interpretation['date'] {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, precision: 'day' };
  m = t.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (m) return { iso: `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`, precision: 'day' };
  m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(?:of\\s+|de\\s+)?(${MONTH_RE})\\.?,?\\s+(?:de\\s+)?(\\d{4})\\b`, 'u'));
  if (m) return { iso: `${m[3]}-${pad(MONTHS[m[2]!]!)}-${pad(Number(m[1]))}`, precision: 'day' };
  m = t.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'u'));
  if (m) return { iso: `${m[3]}-${pad(MONTHS[m[1]!]!)}-${pad(Number(m[2]))}`, precision: 'day' };
  m = t.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(?:of\\s+|de\\s+)?(\\d{4})\\b`, 'u'));
  if (m) return { iso: `${m[2]}-${pad(MONTHS[m[1]!]!)}`, precision: 'month' };
  m = t.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return { iso: m[1]!, precision: 'year' };
  return { iso: null, precision: 'unknown' };
}

const PREPOSITIONS = ['at', 'in', 'on', 'near', 'by', 'from', 'to', 'am', 'im', 'an der', 'auf dem', 'bei', 'in der', 'em', 'no', 'na', 'à', 'au', 'sur', 'en', 'en el', 'junto ao', 'vor dem'];
const STOP = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Sundays', 'Saturdays', 'Christmas', 'Easter', 'I', 'We', 'My', 'Our', 'The', 'It', 'He', 'She', 'They', 'Ich', 'Wir', 'Mein', 'Meine', 'Unser', 'Der', 'Die', 'Das', 'Eu', 'Nós', 'Je', 'Nous', 'And', 'But', 'When', 'That']);
const MONTH_WORDS = new Set(Object.keys(MONTHS).map((m) => m[0]!.toUpperCase() + m.slice(1)));

export function extractPlaces(text: string): string[] {
  const prep = PREPOSITIONS.map((p) => p.replace(/ /g, '\\s+')).join('|');
  const cap = "\\p{Lu}[\\p{L}'’.-]*";
  const connector = "(?:\\s+(?:des|de|du|da|do|dos|das|del|di|von|am|an|der|of|the|la|le|les|y|e|&)\\s+|\\s+)";
  const re = new RegExp(`(?:^|[\\s,(])(?:${prep})\\s+((?:the\\s+)?${cap}(?:${connector}${cap}){0,5}(?:,\\s*${cap}(?:\\s+${cap}){0,2}){0,2})`, 'gu');
  const found: string[] = [];
  for (const m of text.matchAll(re)) {
    let phrase = m[1]!.replace(/^the\s+/i, '').trim().replace(/[.,;:!?]+$/, '');
    const words = phrase.split(/\s+/);
    while (words.length && (STOP.has(words[words.length - 1]!) || MONTH_WORDS.has(words[words.length - 1]!))) words.pop();
    phrase = words.join(' ').replace(/[.,;:!?]+$/, '');
    if (phrase.length > 2 && !MONTH_WORDS.has(phrase) && !STOP.has(phrase)) found.push(phrase);
  }
  return [...new Set(found)].slice(0, 5);
}

const MOOD_WORDS: [Mood, RegExp][] = [
  ['romantic', /\b(engaged|engagement|propos\w*|married|wedding|honeymoon|kiss\w*|first date|love|we met|met by|kennengelernt|boda|fiançailles|verlob\w*|hochzeit|heirat\w*|geküsst|liebe|noivad\w*|casamento|casámos|beijo|amor|fiançailles|mariage|baiser)\b/iu],
  ['bittersweet', /\b(passed away|funeral|goodbye|last time|miss (him|her|you)|gestorben|abschied|vermisse|faleceu|saudade|adeus|décédé)\b/iu],
  ['celebratory', /\b(graduat\w*|birthday|celebrat\w*|party|anniversary|promotion|won|born|marathon|finished|adopted|geburtstag|feier\w*|jubiläum|abschluss|aniversário|formatura|festa|anniversaire)\b/iu],
  ['adventurous', /\b(hike|hiking|climb\w*|road trip|trip|travel\w*|viagem|viaje|reise|backpack\w*|adventure|summit|expedition|wander\w*|abenteuer|aventura|trilha|randonnée)\b/iu],
  ['nostalgic', /\b(childhood|grandma|grandpa|grandmother|grandfather|used to|growing up|kindheit|oma|opa|früher|infância|avó|avô|enfance|grand-mère)\b/iu],
  ['calm', /\b(quiet|peaceful|calm|sunset|sunrise|still|ruhig|sonnenuntergang|tranquil\w*|pôr do sol|paisible)\b/iu],
];

export function extractMood(text: string): Mood {
  for (const [mood, re] of MOOD_WORDS) if (re.test(text)) return mood;
  return 'neutral';
}

const TITLES: Record<string, Partial<Record<Mood, string[]>> & { default: string[] }> = {
  en: { romantic: ['Where it all began', 'Our place'], celebratory: ['A day to remember'], adventurous: ['The adventure begins'], nostalgic: ['Home is where the heart is'], bittersweet: ['Forever in our hearts'], calm: ['Our quiet place'], default: ['A place to remember'] },
  de: { romantic: ['Wo alles begann', 'Unser Ort'], celebratory: ['Ein Tag zum Erinnern'], adventurous: ['Das Abenteuer beginnt'], nostalgic: ['Hier ist Zuhause'], bittersweet: ['Für immer im Herzen'], calm: ['Unser stiller Ort'], default: ['Ein Ort zum Erinnern'] },
  pt: { romantic: ['Onde tudo começou', 'O nosso lugar'], celebratory: ['Um dia para lembrar'], adventurous: ['A aventura começa'], nostalgic: ['Lar, doce lar'], bittersweet: ['Para sempre no coração'], calm: ['O nosso cantinho'], default: ['Um lugar para lembrar'] },
};

function guessLanguage(text: string, locale: string): string {
  const t = ` ${text.toLowerCase()} `;
  const score = (words: string[]) => words.reduce((s, w) => s + (t.includes(` ${w} `) ? 1 : 0), 0);
  const de = score(['ich', 'wir', 'und', 'der', 'die', 'das', 'am', 'im', 'mit', 'haben', 'unser']);
  const pt = score(['eu', 'nós', 'e', 'o', 'a', 'em', 'no', 'na', 'com', 'foi', 'nosso']);
  const en = score(['i', 'we', 'and', 'the', 'at', 'in', 'on', 'with', 'our', 'was', 'my']);
  const best = Math.max(de, pt, en);
  if (best === 0) return locale.slice(0, 2);
  return best === de ? 'de' : best === pt ? 'pt' : 'en';
}

export function createHeuristicProvider(): InterpretationProvider {
  return {
    name: 'heuristic',
    async interpret(text, locale) {
      const language = guessLanguage(text, locale);
      const mood = extractMood(text);
      const titles = TITLES[language] ?? TITLES.en!;
      return normalizeInterpretation(
        {
          language,
          places: extractPlaces(text).map((query, i) => ({ query, role: i === 0 ? 'primary' : 'secondary', confidence: 0.4 })),
          date: extractDate(text),
          mood,
          titleIdeas: titles[mood] ?? titles.default,
          subtitleIdea: null,
        },
        locale,
      );
    },
  };
}
