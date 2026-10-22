'use strict';
// Question generator. Every question: { type, text:{pl,en}, speak:{pl,en}, prompt (big thing to show), options:[{label, emoji, svg, color}], answer:index, item (what gets delivered) }
// Words: emoji + Polish + English name. Short, unambiguous pictures only.
const WORDS = [
  ['🐱','KOT','CAT'],['🐶','PIES','DOG'],['🏠','DOM','HOUSE'],['🚗','AUTO','CAR'],['🐟','RYBA','FISH'],['☀️','SŁOŃCE','SUN'],
  ['🍦','LODY','ICE CREAM'],['🍎','JABŁKO','APPLE'],['🍌','BANAN','BANANA'],['🐉','SMOK','DRAGON'],['🐸','ŻABA','FROG'],['🐮','KROWA','COW'],
  ['🐭','MYSZ','MOUSE'],['🦁','LEW','LION'],['🧀','SER','CHEESE'],['👃','NOS','NOSE'],['👟','BUT','SHOE'],['🌙','KSIĘŻYC','MOON'],
  ['⭐','GWIAZDA','STAR'],['🤖','ROBOT','ROBOT'],['🚲','ROWER','BIKE'],['🎂','TORT','CAKE'],['⚽','PIŁKA','BALL'],['🔑','KLUCZ','KEY'],
  ['⏰','ZEGAR','CLOCK'],['🌸','KWIAT','FLOWER'],['🐦','PTAK','BIRD'],['🐍','WĄŻ','SNAKE'],['🦉','SOWA','OWL'],['🐵','MAŁPA','MONKEY'],
  ['🐌','ŚLIMAK','SNAIL'],['🦋','MOTYL','BUTTERFLY'],['🐝','PSZCZOŁA','BEE'],['🚂','POCIĄG','TRAIN'],['🚢','STATEK','SHIP'],['🚀','RAKIETA','ROCKET'],
  ['✈️','SAMOLOT','PLANE'],['🎈','BALON','BALLOON'],['🎁','PREZENT','GIFT'],['📖','KSIĄŻKA','BOOK'],['🔥','OGIEŃ','FIRE'],['🍞','CHLEB','BREAD'],
  ['🥚','JAJKO','EGG'],['🥕','MARCHEWKA','CARROT'],['🍕','PIZZA','PIZZA'],['🌳','DRZEWO','TREE'],['🍄','GRZYB','MUSHROOM'],['🦆','KACZKA','DUCK'],
  ['🐴','KOŃ','HORSE'],['🐷','ŚWINKA','PIG'],['🐑','OWCA','SHEEP'],['🐔','KURA','HEN'],['🐧','PINGWIN','PENGUIN'],['🐳','WIELORYB','WHALE'],
  ['🦈','REKIN','SHARK'],['🦀','KRAB','CRAB'],['🐯','TYGRYS','TIGER'],['🐘','SŁOŃ','ELEPHANT'],['🦓','ZEBRA','ZEBRA'],['🦒','ŻYRAFA','GIRAFFE'],
  ['🐻','MIŚ','BEAR'],['🦊','LIS','FOX'],['🐺','WILK','WOLF'],['🦕','DINOZAUR','DINO'],['🦄','JEDNOROŻEC','UNICORN'],['👑','KORONA','CROWN'],
  ['🎩','KAPELUSZ','HAT'],['☂️','PARASOL','UMBRELLA'],['🏰','ZAMEK','CASTLE'],['⛺','NAMIOT','TENT'],['✉️','LIST','LETTER'],['🎸','GITARA','GUITAR'],
  ['🥁','BĘBEN','DRUM'],['🎺','TRĄBKA','TRUMPET'],['🍓','TRUSKAWKA','STRAWBERRY'],['🍉','ARBUZ','WATERMELON'],['🍪','CIASTKO','COOKIE'],['🧸','MIŚ','TEDDY'],
  ['🐢','ŻÓŁW','TURTLE'],['🐙','OŚMIORNICA','OCTOPUS'],['🚁','HELIKOPTER','HELICOPTER'],['🚜','TRAKTOR','TRACTOR'],['🚒','STRAŻ','FIRE TRUCK'],['🌈','TĘCZA','RAINBOW'],
].map(([e, pl, en]) => ({ e, pl, en }));
// Groups for "odd one out"
const GROUPS = {
  animals: ['🐱','🐶','🐸','🐮','🐭','🦁','🐦','🐍','🦉','🐵','🐌','🦋','🐝','🦆','🐴','🐷','🐑','🐔','🐧','🐳','🦈','🦀','🐯','🐘','🦓','🦒','🐻','🦊','🐺','🐢','🐙'],
  vehicles: ['🚗','🚲','🚂','🚢','🚀','✈️','🚁','🚜','🚒'],
  food: ['🍦','🍎','🍌','🧀','🎂','🍞','🥚','🥕','🍕','🍓','🍉','🍪','🍄'],
  things: ['🏠','🔑','⏰','📖','🎁','🎈','⚽','👑','🎩','☂️','🏰','⛺','🎸','🥁','🎺','🧸'],
};
const COLORS = [
  { k: 'red', hex: '#ff4d4d', pl: 'czerwony', en: 'red' }, { k: 'blue', hex: '#3d8bff', pl: 'niebieski', en: 'blue' },
  { k: 'green', hex: '#4cd964', pl: 'zielony', en: 'green' }, { k: 'yellow', hex: '#ffd93d', pl: 'żółty', en: 'yellow' },
  { k: 'orange', hex: '#ff9f2e', pl: 'pomarańczowy', en: 'orange' }, { k: 'purple', hex: '#b46cff', pl: 'fioletowy', en: 'purple' },
  { k: 'pink', hex: '#ff7ad9', pl: 'różowy', en: 'pink' }, { k: 'white', hex: '#fafafa', pl: 'biały', en: 'white' }, { k: 'black', hex: '#2b2b35', pl: 'czarny', en: 'black' },
];
const SHAPES = [
  { k: 'circle', pl: 'koło', en: 'circle', pa: 'koła', ea: 'circle', path: 'M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84z' },
  { k: 'square', pl: 'kwadrat', en: 'square', path: 'M12 12h76v76H12z' },
  { k: 'triangle', pl: 'trójkąt', en: 'triangle', path: 'M50 8L94 90H6z' },
  { k: 'star', pl: 'gwiazda', en: 'star', path: 'M50 6l13 27 30 4-22 21 6 30-27-15-27 15 6-30L7 37l30-4z' },
  { k: 'heart', pl: 'serce', en: 'heart', path: 'M50 90C20 66 6 50 6 32A20 20 0 0 1 50 22a20 20 0 0 1 44 10c0 18-14 34-44 58z' },
  { k: 'rect', pl: 'prostokąt', en: 'rectangle', path: 'M6 26h88v48H6z' },
];
const SHAPE_SVG = (s, color) => `<svg viewBox="0 0 100 100"><path d="${s.path}" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linejoin="round"/></svg>`;

const R = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[R(a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (a, n, not = () => false) => shuffle(a.filter(x => !not(x))).slice(0, n);
const name = (w, l) => (l === 'en' ? w.en : w.pl);
const first = (w, l) => name(w, l)[0];

// numbers in words so speech sounds natural and so pre-readers hear "three" not "3"
const NUM = {
  pl: ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć', 'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście', 'dwadzieścia'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
};
const numOptions = (ans, max, n = 3) => {
  const s = new Set([ans]);
  let guard = 0;
  while (s.size < n && guard++ < 100) { const v = Math.max(0, Math.min(max, ans + (R(5) - 2))); if (v !== ans) s.add(v); }
  while (s.size < n) s.add(R(max + 1));
  return shuffle([...s]);
};

// Which question types a given age gets (weights). wl = words language.
const GENERATORS = {
  count(age) {
    const max = age <= 5 ? 5 : age <= 6 ? 7 : 10;
    const n = 1 + R(max);
    const w = pick(WORDS);
    const opts = numOptions(n, max);
    return {
      type: 'count', item: w.e,
      text: { pl: `Ile tu jest? Policz!`, en: `How many are there? Count!` },
      speak: { pl: `Policz, ile tu jest.`, en: `Count how many there are.` },
      prompt: { kind: 'emojis', items: Array(n).fill(w.e) },
      options: opts.map(v => ({ label: String(v), say: { pl: NUM.pl[v], en: NUM.en[v] } })),
      answer: opts.indexOf(n),
    };
  },
  color(age) {
    const cs = sample(COLORS, age <= 5 ? 3 : 4);
    const c = pick(cs);
    const shape = pick(SHAPES);
    return {
      type: 'color', item: '🎨',
      text: { pl: `Który jest <b>${c.pl}</b>?`, en: `Which one is <b>${c.en}</b>?` },
      speak: { pl: `Który jest ${c.pl}?`, en: `Which one is ${c.en}?` },
      prompt: null,
      options: cs.map(x => ({ svg: SHAPE_SVG(shape, x.hex), say: { pl: x.pl, en: x.en } })),
      answer: cs.indexOf(c),
    };
  },
  shape(age) {
    const ss = sample(SHAPES, age <= 5 ? 3 : 4);
    const s = pick(ss);
    return {
      type: 'shape', item: '🔷',
      text: { pl: `Znajdź: <b>${s.pl}</b>`, en: `Find the <b>${s.en}</b>` },
      speak: { pl: `Znajdź ${s.pl}.`, en: `Find the ${s.en}.` },
      prompt: null,
      options: ss.map(x => ({ svg: SHAPE_SVG(x, pick(COLORS.slice(0, 7)).hex), say: { pl: x.pl, en: x.en } })),
      answer: ss.indexOf(s),
    };
  },
  letter(age, wl) {
    const w = pick(WORDS);
    const L = first(w, wl);
    const others = sample(WORDS, age <= 5 ? 2 : 3, x => first(x, wl) === L);
    const opts = shuffle([w, ...others]);
    return {
      type: 'letter', item: w.e,
      text: { pl: `Co zaczyna się na literę <b>${L}</b>?`, en: `What starts with the letter <b>${L}</b>?` },
      speak: { pl: `Co zaczyna się na literę ${L}?`, en: `What starts with the letter ${L}?` },
      prompt: { kind: 'letter', letter: L },
      options: opts.map(x => ({ emoji: x.e, label: name(x, wl), say: { pl: name(x, 'pl'), en: name(x, 'en') } })),
      answer: opts.indexOf(w),
    };
  },
  read(age, wl) {
    const short = WORDS.filter(x => name(x, wl).length <= (age <= 5 ? 3 : age <= 6 ? 4 : 6) && !name(x, wl).includes(' '));
    const pool = short.length >= 4 ? short : WORDS;
    const w = pick(pool);
    const others = sample(WORDS, age <= 5 ? 2 : 3, x => x === w);
    const opts = shuffle([w, ...others]);
    return {
      type: 'read', item: w.e,
      text: { pl: `Przeczytaj i znajdź obrazek:`, en: `Read it and find the picture:` },
      speak: { pl: `Przeczytaj słowo i znajdź obrazek.`, en: `Read the word and find the picture.` },
      prompt: { kind: 'word', word: name(w, wl) },
      options: opts.map(x => ({ emoji: x.e, say: { pl: name(x, 'pl'), en: name(x, 'en') } })),
      answer: opts.indexOf(w),
    };
  },
  add(age) {
    const max = age <= 5 ? 5 : age <= 6 ? 8 : age <= 7 ? 10 : 20;
    const a = 1 + R(max - 1), b = 1 + R(max - a);
    const w = pick(WORDS);
    const opts = numOptions(a + b, max);
    return {
      type: 'add', item: w.e,
      text: { pl: `Ile to razem?`, en: `How many altogether?` },
      speak: { pl: `${NUM.pl[a]} dodać ${NUM.pl[b]}. Ile to razem?`, en: `${NUM.en[a]} plus ${NUM.en[b]}. How many altogether?` },
      prompt: { kind: 'math', a, b, op: '+', e: w.e },
      options: opts.map(v => ({ label: String(v), say: { pl: NUM.pl[v], en: NUM.en[v] } })),
      answer: opts.indexOf(a + b),
    };
  },
  sub(age) {
    const max = age <= 6 ? 6 : age <= 7 ? 10 : 20;
    const a = 2 + R(max - 1), b = 1 + R(a - 1);
    const w = pick(WORDS);
    const opts = numOptions(a - b, max);
    return {
      type: 'sub', item: w.e,
      text: { pl: `Ile zostanie?`, en: `How many are left?` },
      speak: { pl: `${NUM.pl[a]} odjąć ${NUM.pl[b]}. Ile zostanie?`, en: `${NUM.en[a]} minus ${NUM.en[b]}. How many are left?` },
      prompt: { kind: 'math', a, b, op: '−', e: w.e },
      options: opts.map(v => ({ label: String(v), say: { pl: NUM.pl[v], en: NUM.en[v] } })),
      answer: opts.indexOf(a - b),
    };
  },
  odd(age) {
    const keys = Object.keys(GROUPS);
    const g = pick(keys), o = pick(keys.filter(k => k !== g));
    const same = sample(GROUPS[g], age <= 5 ? 2 : 3);
    const odd = pick(GROUPS[o]);
    const opts = shuffle([...same, odd]);
    return {
      type: 'odd', item: odd,
      text: { pl: `Co tu <b>nie pasuje</b>?`, en: `Which one <b>doesn't belong</b>?` },
      speak: { pl: `Co tu nie pasuje do reszty?`, en: `Which one doesn't belong with the others?` },
      prompt: null,
      options: opts.map(e => ({ emoji: e })),
      answer: opts.indexOf(odd),
    };
  },
  pattern(age) {
    const [a, b, c] = sample(WORDS, 3);
    const seqs = age <= 5 ? [[a, b, a, b, a], [a, a, b, a, a]] : [[a, b, a, b, a], [a, b, c, a, b], [a, a, b, a, a], [a, b, b, a, b]];
    const seq = pick(seqs);
    const next = seq.length === 5 && seq[0] === seq[2] && seq[1] === seq[3] ? seq[1] : (seq[0] === seq[1] ? seq[2] : seq[2]);
    // compute next by repeating pattern: find period
    const per = seq[0] === seq[2] && seq[1] === seq[3] ? 2 : 3;
    const ans = seq[seq.length % per];
    const opts = shuffle([...new Set([a, b, c])]);
    return {
      type: 'pattern', item: ans.e,
      text: { pl: `Co będzie <b>dalej</b>?`, en: `What comes <b>next</b>?` },
      speak: { pl: `Co będzie dalej?`, en: `What comes next?` },
      prompt: { kind: 'emojis', items: [...seq.map(w => w.e), '❓'] },
      options: opts.map(w => ({ emoji: w.e, say: { pl: w.pl, en: w.en } })),
      answer: opts.indexOf(ans),
    };
  },
  more(age) {
    const max = age <= 5 ? 5 : 9;
    const w1 = pick(WORDS), w2 = pick(WORDS.filter(w => w !== w1));
    let a = 1 + R(max), b = 1 + R(max); if (a === b) b = a === max ? a - 1 : a + 1;
    const opts = [{ emoji: w1.e, count: a }, { emoji: w2.e, count: b }];
    return {
      type: 'more', item: a > b ? w1.e : w2.e,
      text: { pl: `Czego jest <b>więcej</b>?`, en: `Which has <b>more</b>?` },
      speak: { pl: `Czego jest więcej?`, en: `Which group has more?` },
      prompt: null,
      options: opts.map(o => ({ emojis: Array(o.count).fill(o.emoji) })),
      answer: a > b ? 0 : 1,
    };
  },
};
function typesFor(age) {
  if (age <= 5) return ['count', 'count', 'color', 'shape', 'odd', 'pattern', 'more', 'letter', 'add'];
  if (age <= 6) return ['count', 'color', 'shape', 'odd', 'pattern', 'more', 'letter', 'letter', 'read', 'add', 'sub'];
  if (age <= 7) return ['count', 'add', 'add', 'sub', 'letter', 'read', 'read', 'pattern', 'odd', 'more', 'shape'];
  return ['add', 'add', 'sub', 'sub', 'read', 'read', 'letter', 'pattern', 'odd', 'more'];
}
function makeQuestion(age, wl, avoidType) {
  let types = typesFor(age).filter(t => t !== avoidType);
  const t = pick(types);
  const q = GENERATORS[t](age, wl);
  if (q.answer < 0) return makeQuestion(age, wl, avoidType); // safety
  return q;
}
