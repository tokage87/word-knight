import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_CONTEXTS,
  CATEGORY_IDS,
  CEFR_BY_TIER,
  EXPERIMENTAL_DIR,
  MASTER_DIR,
  ROOT,
  SNAPSHOT_DIR,
  VOCAB_BANKS,
  slugify,
} from './experimental-catalog-seed.mjs';

const SOURCE_FILES = ['vocab.json', 'sentences.json', 'stories.json'];
const TIERS = [1, 2, 3];
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'can',
  'could',
  'will',
  'might',
  'in',
  'on',
  'at',
  'by',
  'near',
  'to',
  'into',
  'with',
  'for',
  'from',
  'before',
  'after',
  'during',
  'when',
  'while',
  'because',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'our',
  'their',
  'everybody',
  'nobody',
  'and',
  'but',
  'or',
  'of',
]);

const STATIC_DISTRACTORS = {
  the: 'a',
  a: 'the',
  an: 'the',
  is: 'are',
  are: 'is',
  this: 'that',
  that: 'this',
  word: 'clue',
  clue: 'word',
  next: 'last',
  first: 'second',
  third: 'second',
  final: 'first',
  now: 'then',
  of: 'for',
  and: 'or',
  but: 'and',
  can: 'will',
  will: 'can',
  could: 'might',
  might: 'could',
  before: 'after',
  after: 'before',
  everybody: 'nobody',
  nobody: 'everybody',
  boring: 'wild',
  wild: 'boring',
  funny: 'serious',
  serious: 'funny',
  brave: 'sleepy',
  sleepy: 'brave',
  tiny: 'giant',
  giant: 'tiny',
  loud: 'quiet',
  quiet: 'loud',
  original: 'random',
  random: 'original',
  first: 'final',
  start: 'end',
  end: 'start',
  Mila: 'Olek',
  Olek: 'Mila',
  Zosia: 'Kuba',
  Kuba: 'Zosia',
  Lena: 'Bartek',
  Bartek: 'Lena',
};

const NO_DISTRACTOR_TOKENS = new Set([
  'this',
  'that',
  'word',
  'clue',
  'now',
  'then',
  'next',
  'first',
  'second',
  'third',
  'final',
]);

const EXTRA_TEMPLATE_TOKENS = [
  'tiny',
  'funny',
  'witty',
  'silly',
  'brave',
  'legendary',
  'dramatic',
  'chaos',
  'plan',
  'mission',
  'quest',
  'story',
  'joke',
  'comedy',
  'show',
  'applause',
  'cape',
  'superhero',
  'boss',
  'giggle',
  'expert',
  'instincts',
  'scene',
  'adventure',
  'side',
  'club',
  'meeting',
  'laugh',
  'laughs',
  'advice',
  'boring',
  'whole',
  'day',
  'problem',
  'method',
  'ridiculous',
  'original',
  'celebrity',
  'comic',
  'timing',
  'enter',
  'arrive',
  'steal',
  'legend',
  'blink',
];

const KINSHIP_WORDS = new Set([
  'mom',
  'dad',
  'brother',
  'sister',
  'grandma',
  'grandpa',
]);

const BARE_WORDS = new Set([
  'family',
  'homework',
  'history',
  'geography',
  'science',
  'pronunciation',
  'spelling',
  'grammar',
  'research',
  'curriculum',
  'criteria',
  'electricity',
  'plumbing',
  'storage',
  'maintenance',
  'renovation',
  'breakfast',
  'lunch',
  'dinner',
  'tea',
  'traffic',
  'construction',
  'arrival',
  'departure',
  'adventure',
  'rescue',
  'seafood',
  'furniture',
  'armor',
  'flavour',
]);

const POLISH_PLURAL_SLUGS = new Set([
  'door',
  'furniture',
  'research',
  'internship',
  'criteria',
  'cereal',
  'seafood',
  'harvest',
  'litter',
  'whiskers',
  'crossroads',
  'barracks',
]);

const LESS_FUN_SLUGS = new Set([
  'electricity',
  'plumbing',
  'storage',
  'maintenance',
  'renovation',
  'receipt',
  'remote',
  'earphone',
  'appliance',
  'furniture',
  'pillowcase',
  'bedsheet',
  'seminar',
  'staff-room',
  'badge',
  'curriculum',
  'research',
  'source',
  'conclusion',
  'portfolio',
  'semester',
  'internship',
  'criteria',
  'habitat',
  'ecosystem',
  'announcement',
  'construction',
  'detour',
  'crowd',
  'departure',
  'arrival',
  'route',
  'commute',
  'boulevard',
  'avenue',
  'district',
  'intersection',
  'platform-ticket',
  'experiment',
  'theorem',
  'gauntlet',
  'quiver',
  'oracle',
  'prophecy',
  'climate',
  'environment',
  'guest-room',
  'doorstep',
]);

const HOUSEHOLD_KITCHEN_THING_SLUGS = new Set([
  'dishwasher',
  'freezer',
  'oven',
]);

const HOUSEHOLD_ROOM_THING_SLUGS = new Set([
  'radiator',
  'wardrobe',
  'sideboard',
  'boiler',
  'mattress',
]);

const NATURE_SPECIAL_DESCRIPTORS = {
  rainbow: { en: 'bright', pl: { m: 'jasny', f: 'jasna', n: 'jasne' } },
  storm: { en: 'loud', pl: { m: 'głośny', f: 'głośna', n: 'głośne' } },
  thunder: { en: 'loud', pl: { m: 'głośny', f: 'głośna', n: 'głośne' } },
  lightning: { en: 'bright', pl: { m: 'jasny', f: 'jasna', n: 'jasne' } },
  sunrise: { en: 'beautiful', pl: { m: 'piękny', f: 'piękna', n: 'piękne' } },
  sunset: { en: 'beautiful', pl: { m: 'piękny', f: 'piękna', n: 'piękne' } },
  breeze: { en: 'quiet', pl: { m: 'cichy', f: 'cicha', n: 'ciche' } },
};

const ENGLISH_PLURAL_SLUGS = new Set([
  'criteria',
  'whiskers',
  'crossroads',
]);

const ANIMATE_SLUGS = new Set([
  'mom',
  'dad',
  'brother',
  'sister',
  'grandma',
  'grandpa',
  'parent',
  'cousin',
  'uncle',
  'aunt',
  'neighbour',
  'teacher',
  'student',
  'friend',
  'counsellor',
  'cat',
  'dog',
  'cow',
  'pig',
  'sheep',
  'duck',
  'frog',
  'bee',
  'bird',
  'butterfly',
  'goldfish',
  'owl',
  'squirrel',
  'parrot',
  'gardener',
  'driver',
  'tourist',
  'guide',
  'pedestrian',
  'cyclist',
  'dragon',
  'wizard',
  'goblin',
  'dwarf',
  'guardian',
  'champion',
  'captain',
  'messenger',
  'traveler',
  'healer',
  'pathfinder',
  'sorcerer',
  'gate-guard',
  'magic-bird',
  'fire-bird',
  'monster',
]);

const PLACEISH_SLUGS = new Set([
  'house',
  'room',
  'living-room',
  'bathroom',
  'bedroom',
  'garden',
  'garage',
  'apartment',
  'balcony',
  'staircase',
  'corridor',
  'attic',
  'basement',
  'pantry',
  'hallway',
  'laundry-room',
  'guest-room',
  'school',
  'classroom',
  'library',
  'laboratory',
  'campus',
  'auditorium',
  'workshop',
  'bakery',
  'cafeteria',
  'forest',
  'meadow',
  'river',
  'lake',
  'field',
  'ocean',
  'island',
  'desert',
  'jungle',
  'path',
  'cave',
  'valley',
  'coast',
  'reef',
  'orchard',
  'creek',
  'town',
  'street',
  'road',
  'bridge',
  'station',
  'playground',
  'hospital',
  'pharmacy',
  'clinic',
  'post-office',
  'restaurant',
  'cafe',
  'fountain',
  'airport',
  'platform',
  'theatre',
  'swimming-pool',
  'office',
  'factory',
  'tower',
  'flower-shop',
  'butcher-shop',
  'petrol-station',
  'bicycle-lane',
  'newsstand',
  'city-hall',
  'boulevard',
  'avenue',
  'district',
  'intersection',
  'exhibition',
  'subway',
  'skyscraper',
  'passage',
  'tram-line',
  'castle',
  'dungeon',
  'kingdom',
  'fortress',
  'archway',
  'spiral-staircase',
  'barracks',
]);

const CAST_NAMES = [
  { en: 'Mila', pl: 'Mila' },
  { en: 'Olek', pl: 'Olek' },
  { en: 'Zosia', pl: 'Zosia' },
  { en: 'Kuba', pl: 'Kuba' },
  { en: 'Lena', pl: 'Lena' },
  { en: 'Bartek', pl: 'Bartek' },
];

const CATEGORY_FLAVOR = {
  household: {
    place: { en: 'the house', pl: 'dom' },
    sidekick: { en: 'the cat', pl: 'kot' },
    scenes: [
      { en: 'before breakfast', pl: 'przed śniadaniem' },
      { en: 'during chores', pl: 'podczas sprzątania' },
      { en: 'after dinner', pl: 'po kolacji' },
      { en: 'on laundry day', pl: 'w dzień prania' },
    ],
    details: [
      { en: 'the cat steals a sock again', pl: 'kot znowu kradnie skarpetkę' },
      { en: 'grandma starts a secret pancake contest', pl: 'babcia zaczyna tajny konkurs na naleśniki' },
      { en: 'someone puts googly eyes on the broom', pl: 'ktoś przykleja miotle śmieszne oczy' },
      { en: 'the toaster sounds like a marching band', pl: 'toster brzmi jak maszerująca orkiestra' },
    ],
  },
  school: {
    place: { en: 'the classroom', pl: 'klasa' },
    sidekick: { en: 'the class hamster', pl: 'klasowy chomik' },
    scenes: [
      { en: 'before the bell', pl: 'przed dzwonkiem' },
      { en: 'during group work', pl: 'podczas pracy w grupie' },
      { en: 'after homework', pl: 'po pracy domowej' },
      { en: 'on quiz day', pl: 'w dzień quizu' },
    ],
    details: [
      { en: 'the class hamster runs across the homework', pl: 'klasowy chomik przebiega po pracy domowej' },
      { en: 'chalk dust makes the teacher sneeze like a dragon', pl: 'pył z kredy sprawia, że nauczyciel kicha jak smok' },
      { en: 'the back row starts a pirate accent challenge', pl: 'ostatnia ławka zaczyna konkurs na piracki akcent' },
      { en: 'a paper airplane lands in the snack box', pl: 'papierowy samolot ląduje w śniadaniówce' },
    ],
  },
  food_kitchen: {
    place: { en: 'the kitchen', pl: 'kuchnia' },
    sidekick: { en: 'the hungry spoon', pl: 'głodna łyżka' },
    scenes: [
      { en: 'before lunch', pl: 'przed obiadem' },
      { en: 'during cooking', pl: 'podczas gotowania' },
      { en: 'at the picnic', pl: 'na pikniku' },
      { en: 'after dessert', pl: 'po deserze' },
    ],
    details: [
      { en: 'the spoon drums on the bowl like a rock star', pl: 'łyżka bębni o miskę jak gwiazda rocka' },
      { en: 'the pancake lands like a flying hat', pl: 'naleśnik ląduje jak latający kapelusz' },
      { en: 'the blender sounds like a tiny helicopter', pl: 'blender brzmi jak mały helikopter' },
      { en: 'somebody guards the last cookie like treasure', pl: 'ktoś pilnuje ostatniego ciastka jak skarbu' },
    ],
  },
  animals_nature: {
    place: { en: 'the meadow', pl: 'łąka' },
    sidekick: { en: 'the chatty squirrel', pl: 'gadatliwa wiewiórka' },
    scenes: [
      { en: 'at sunrise', pl: 'o świcie' },
      { en: 'after the rain', pl: 'po deszczu' },
      { en: 'by the pond', pl: 'przy stawie' },
      { en: 'before sunset', pl: 'przed zachodem słońca' },
    ],
    details: [
      { en: 'a duck walks like it owns the lake', pl: 'kaczka chodzi tak, jakby posiadała całe jezioro' },
      { en: 'the squirrel acts like a tour guide', pl: 'wiewiórka zachowuje się jak przewodnik' },
      { en: 'rain turns every path into a splash contest', pl: 'deszcz zamienia każdą ścieżkę w konkurs chlapania' },
      { en: 'a fox watches everything like a tiny detective', pl: 'lis obserwuje wszystko jak mały detektyw' },
    ],
  },
  town_places: {
    place: { en: 'the town square', pl: 'rynek' },
    sidekick: { en: 'the city pigeon', pl: 'miejski gołąb' },
    scenes: [
      { en: 'before the bus arrives', pl: 'zanim przyjedzie autobus' },
      { en: 'near the bridge', pl: 'przy moście' },
      { en: 'after school', pl: 'po szkole' },
      { en: 'at the market', pl: 'na rynku' },
    ],
    details: [
      { en: 'a pigeon judges every shoe in sight', pl: 'gołąb ocenia każdy but w okolicy' },
      { en: 'a busker turns traffic into a dance beat', pl: 'uliczny grajek zamienia ruch uliczny w taneczny rytm' },
      { en: 'the bus arrives with superhero timing', pl: 'autobus przyjeżdża z wyczuciem czasu superbohatera' },
      { en: 'someone drops balloons near the station', pl: 'ktoś wypuszcza balony przy stacji' },
    ],
  },
  fantasy_adventure: {
    place: { en: 'the castle', pl: 'zamek' },
    sidekick: { en: 'the grumpy goblin', pl: 'marudny goblin' },
    scenes: [
      { en: 'before dawn', pl: 'przed świtem' },
      { en: 'after a spell', pl: 'po zaklęciu' },
      { en: 'by the portal', pl: 'przy portalu' },
      { en: 'during guard duty', pl: 'podczas warty' },
    ],
    details: [
      { en: 'the goblin complains about broom duty', pl: 'goblin narzeka na dyżur z miotłą' },
      { en: 'a tiny spell paints the soup blue', pl: 'małe zaklęcie maluje zupę na niebiesko' },
      { en: 'the dragon snores like a brass band', pl: 'smok chrapie jak orkiestra dęta' },
      { en: 'the wizard treats chores like a heroic quest', pl: 'czarodziej traktuje porządki jak bohaterską misję' },
    ],
  },
};

const FRAME_SELECTIONS = {
  household: {
    animate: [0, 1, 2, 4, 9, 11],
    thing: [5, 6, 7, 8],
    place: [0, 1, 2],
  },
  school: {
    animate: [0, 1, 2, 10],
    thing: [3, 4, 6],
    place: [0, 1, 2],
  },
  food_kitchen: {
    animate: [0, 5, 6, 7, 10],
    thing: [0, 4, 8],
    place: [0, 5, 6],
  },
  animals_nature: {
    animate: [0, 1, 2, 3, 5, 6, 7, 8, 9, 10],
    thing: [0, 1, 2, 3, 8, 9],
    place: [0, 1, 2],
  },
  town_places: {
    animate: [0, 1, 2, 3, 6, 10, 11],
    thing: [1, 2, 3, 4, 10],
    place: [0, 1, 2],
  },
  fantasy_adventure: {
    animate: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    thing: [1, 3, 5, 7, 11],
    place: [0, 1, 2],
  },
};

const PLACE_DESCRIPTORS = {
  household: [
    { en: 'quiet', pl: { m: 'cichy', f: 'cicha', n: 'ciche' } },
    { en: 'small', pl: { m: 'mały', f: 'mała', n: 'małe' } },
    { en: 'bright', pl: { m: 'jasny', f: 'jasna', n: 'jasne' } },
  ],
  school: [
    { en: 'quiet', pl: { m: 'cichy', f: 'cicha', n: 'ciche' } },
    { en: 'big', pl: { m: 'duży', f: 'duża', n: 'duże' } },
    { en: 'busy', pl: { m: 'ruchliwy', f: 'ruchliwa', n: 'ruchliwe' } },
  ],
  food_kitchen: [
    { en: 'warm', pl: { m: 'ciepły', f: 'ciepła', n: 'ciepłe' } },
    { en: 'bright', pl: { m: 'jasny', f: 'jasna', n: 'jasne' } },
    { en: 'busy', pl: { m: 'ruchliwy', f: 'ruchliwa', n: 'ruchliwe' } },
  ],
  animals_nature: [
    { en: 'quiet', pl: { m: 'cichy', f: 'cicha', n: 'ciche' } },
    { en: 'big', pl: { m: 'duży', f: 'duża', n: 'duże' } },
    { en: 'beautiful', pl: { m: 'piękny', f: 'piękna', n: 'piękne' } },
  ],
  town_places: [
    { en: 'big', pl: { m: 'duży', f: 'duża', n: 'duże' } },
    { en: 'new', pl: { m: 'nowy', f: 'nowa', n: 'nowe' } },
    { en: 'busy', pl: { m: 'ruchliwy', f: 'ruchliwa', n: 'ruchliwe' } },
  ],
  fantasy_adventure: [
    { en: 'dark', pl: { m: 'ciemny', f: 'ciemna', n: 'ciemne' } },
    { en: 'old', pl: { m: 'stary', f: 'stara', n: 'stare' } },
    { en: 'quiet', pl: { m: 'cichy', f: 'cicha', n: 'ciche' } },
  ],
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tokenizeWords(value) {
  return value
    .replace(/[.,!?]/g, '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenPoolForBucket(category, bucket) {
  const flavor = CATEGORY_FLAVOR[category];
  const frameTokens = CATEGORY_CONTEXTS[category].frames.flatMap((frame) =>
    tokenizeWords(frame.en),
  );
  const wordTokens = bucket.flatMap((entry) => tokenizeWords(entry.en));
  const flavorTokens = [
    ...tokenizeWords(flavor.place.en),
    ...tokenizeWords(flavor.sidekick.en),
    ...flavor.scenes.flatMap((scene) => tokenizeWords(scene.en)),
    ...flavor.details.flatMap((detail) => tokenizeWords(detail.en)),
    ...CAST_NAMES.flatMap((name) => tokenizeWords(name.en)),
    ...EXTRA_TEMPLATE_TOKENS,
  ];
  return [
    ...new Set(
      [
        ...frameTokens,
        ...wordTokens,
        ...flavorTokens,
        'this',
        'that',
        'word',
        'clue',
        'now',
        'then',
        'next',
        'first',
        'second',
        'third',
        'final',
      ].map((token) =>
        token.toLowerCase(),
      ),
    ),
  ];
}

function preserveCase(source, replacement) {
  if (!replacement) return source;
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return capitalize(replacement);
  return replacement;
}

function chooseContentDistractor(token, tokenPool, seed) {
  const candidates = tokenPool.filter(
    (candidate) =>
      candidate !== token.toLowerCase() &&
      !STOPWORDS.has(candidate) &&
      !NO_DISTRACTOR_TOKENS.has(candidate) &&
      candidate.length > 1,
  );
  if (candidates.length === 0) return token;
  return candidates[seed % candidates.length];
}

function buildSteps(text, tokenPool, seedBase) {
  return tokenizeWords(text).map((correct, index) => {
    const lower = correct.toLowerCase();
    const mapped = STATIC_DISTRACTORS[lower];
    const distractor = mapped ?? chooseContentDistractor(correct, tokenPool, seedBase + index);
    return {
      correct,
      distractor: preserveCase(correct, distractor),
    };
  });
}

function makeVocabEntry(category, tier, entry, bucket, index) {
  const cefr = CEFR_BY_TIER[tier];
  const id = `${category}-${cefr}-${slugify(entry.en)}`;
  const others = bucket.filter((candidate) => candidate.en !== entry.en);
  const distractors = [1, 2, 3].map((offset) => others[(index + offset) % others.length].en);
  return {
    id,
    pl: entry.pl,
    en: entry.en,
    distractors,
    tier,
    cefr,
    category,
  };
}

function pickUsableWords(category, bucket, needed) {
  const forbidden = new Set(
    CATEGORY_CONTEXTS[category].frames.map((frame) => slugify(frame.key)),
  );
  const preferred = bucket.filter((entry) => !forbidden.has(slugify(entry.en)));
  const ordered = preferred.length >= needed ? preferred : [...preferred, ...bucket];
  return [...ordered]
    .map((entry, index) => ({
      entry,
      index,
      score:
        (LESS_FUN_SLUGS.has(slugify(entry.en)) ? -40 : 0) +
        (BARE_WORDS.has(slugify(entry.en)) ? -20 : 0) +
        (PLACEISH_SLUGS.has(slugify(entry.en)) && category !== 'town_places' ? -10 : 0) +
        (KINSHIP_WORDS.has(slugify(entry.en)) ? 12 : 0) +
        (entry.en.length > 14 ? -6 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, needed)
    .map((item) => item.entry);
}

function subjectPhrases(entry) {
  const slug = slugify(entry.en);
  const bareEnglish = KINSHIP_WORDS.has(slug) || BARE_WORDS.has(slug);
  const en = bareEnglish ? entry.en : `the ${entry.en}`;
  const pl = entry.pl;
  return {
    slug,
    en,
    enCap: capitalize(en),
    pl,
    plCap: capitalize(pl),
    plIsPlural: POLISH_PLURAL_SLUGS.has(slug),
    enIsPlural: ENGLISH_PLURAL_SLUGS.has(slug),
    kind: ANIMATE_SLUGS.has(slug)
      ? 'animate'
      : PLACEISH_SLUGS.has(slug)
        ? 'place'
        : 'thing',
    plGender: POLISH_PLURAL_SLUGS.has(slug)
      ? 'plural'
      : /a$/i.test(pl)
        ? 'feminine'
        : /(o|e|ę|um)$/i.test(pl)
          ? 'neuter'
          : 'masculine',
  };
}

function plForm(subject, singular, plural) {
  return subject.plIsPlural ? plural : singular;
}

function enForm(subject, singular, plural) {
  return subject.enIsPlural ? plural : singular;
}

function plAdjective(subject, forms) {
  if (subject.plGender === 'feminine') return forms.f;
  if (subject.plGender === 'neuter' || subject.plGender === 'plural') return forms.n;
  return forms.m;
}

function pickFrame(category, kind, index) {
  const frames = CATEGORY_CONTEXTS[category].frames;
  const allowedIndexes = FRAME_SELECTIONS[category][kind];
  return frames[allowedIndexes[index % allowedIndexes.length]];
}

function pickPlaceDescriptor(category, seed) {
  const descriptors = PLACE_DESCRIPTORS[category];
  return descriptors[seed % descriptors.length];
}

function buildSimpleLine(subject, category, seed, variantOffset = 0) {
  const frame = pickFrame(category, subject.kind, seed + variantOffset);

  if (category === 'animals_nature' && NATURE_SPECIAL_DESCRIPTORS[subject.slug]) {
    const descriptor = NATURE_SPECIAL_DESCRIPTORS[subject.slug];
    return {
      en: `${subject.enCap} ${enForm(subject, 'is', 'are')} ${descriptor.en}.`,
      pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${plAdjective(subject, descriptor.pl)}.`,
    };
  }

  if (category === 'household' && subject.kind === 'thing') {
    if (HOUSEHOLD_KITCHEN_THING_SLUGS.has(subject.slug)) {
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} in the kitchen.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} w kuchni.`,
      };
    }

    if (HOUSEHOLD_ROOM_THING_SLUGS.has(subject.slug)) {
      const roomFrames = [
        { en: 'in the room', pl: 'w pokoju' },
        { en: 'in the bedroom', pl: 'w sypialni' },
        { en: 'in the hallway', pl: 'w przedpokoju' },
      ];
      const roomFrame = roomFrames[(seed + variantOffset) % roomFrames.length];
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} ${roomFrame.en}.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${roomFrame.pl}.`,
      };
    }
  }

  const variantsByKind = {
    animate: ['location', 'sleep', 'wait', 'happy', 'location'],
    place: ['place_desc', 'place_desc', 'place_desc'],
    thing: ['location', 'location', 'location', 'location'],
  };

  const mode = variantsByKind[subject.kind][(seed + variantOffset) % variantsByKind[subject.kind].length];

  switch (mode) {
    case 'location':
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} ${frame.en}.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${frame.pl}.`,
      };
    case 'sleep':
      return {
        en: `${subject.enCap} ${enForm(subject, 'sleeps', 'sleep')} ${frame.en}.`,
        pl: `${subject.plCap} ${plForm(subject, 'śpi', 'śpią')} ${frame.pl}.`,
      };
    case 'wait':
      return {
        en: `${subject.enCap} ${enForm(subject, 'waits', 'wait')} ${frame.en}.`,
        pl: `${subject.plCap} ${plForm(subject, 'czeka', 'czekają')} ${frame.pl}.`,
      };
    case 'happy':
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} happy.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${plAdjective(subject, { m: 'szczęśliwy', f: 'szczęśliwa', n: 'szczęśliwe' })}.`,
      };
    case 'place_desc': {
      const descriptor = pickPlaceDescriptor(category, seed + variantOffset);
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} ${descriptor.en}.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${plAdjective(subject, descriptor.pl)}.`,
      };
    }
    case 'noise':
      return {
        en: `${subject.enCap} ${enForm(subject, 'makes', 'make')} a lot of noise.`,
        pl: `${subject.plCap} ${plForm(subject, 'robi', 'robią')} dużo hałasu.`,
      };
    case 'loud':
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} loud.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${plAdjective(subject, { m: 'głośny', f: 'głośna', n: 'głośne' })}.`,
      };
    case 'strange':
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} strange.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${plAdjective(subject, { m: 'dziwny', f: 'dziwna', n: 'dziwne' })}.`,
      };
    case 'quiet':
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} quiet.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${plAdjective(subject, { m: 'cichy', f: 'cicha', n: 'ciche' })}.`,
      };
    case 'here':
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} here.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} tutaj.`,
      };
    case 'funny':
    default:
      return {
        en: `${subject.enCap} ${enForm(subject, 'is', 'are')} funny.`,
        pl: `${subject.plCap} ${plForm(subject, 'jest', 'są')} ${plAdjective(subject, { m: 'śmieszny', f: 'śmieszna', n: 'śmieszne' })}.`,
      };
  }
}

const STORY_TITLE_PATTERNS = [
  ({ a, b }) => `${a} and ${b}`,
  ({ a }) => `A Day with ${a}`,
  ({ a, b }) => `${a} Meets ${b}`,
  ({ a, b }) => `${a} near ${b}`,
  ({ a }) => `${a} Today`,
];

function makeSentenceTask(category, tier, entry, tokenPool, index) {
  const cefr = CEFR_BY_TIER[tier];
  const subject = subjectPhrases(entry);
  const flavor = CATEGORY_FLAVOR[category];
  const categoryOffset = CATEGORY_IDS.indexOf(category);
  const variantSeed = index + categoryOffset + tier + flavor.scenes.length;
  const { en: textEn, pl: textPl } = buildSimpleLine(subject, category, variantSeed);
  return {
    id: `${category}-${cefr}-sentence-${String(index + 1).padStart(2, '0')}`,
    pl: textPl,
    steps: buildSteps(textEn, tokenPool, index * 7),
    tier,
    cefr,
    category,
    vocabIds: [`${category}-${cefr}-${slugify(entry.en)}`],
  };
}

function storyTitle(entries, storyIndex) {
  const primary = titleCase(entries[0].en);
  const secondary = titleCase(entries[1]?.en ?? entries[0].en);
  const template = STORY_TITLE_PATTERNS[storyIndex % STORY_TITLE_PATTERNS.length];
  return template({ a: primary, b: secondary });
}

function makeStory(category, tier, entries, storyIndex, tokenPool) {
  const cefr = CEFR_BY_TIER[tier];
  const storyId = `${category}-${cefr}-story-${String(storyIndex + 1).padStart(2, '0')}`;
  const subjects = entries.map((entry) => subjectPhrases(entry));
  const categoryOffset = CATEGORY_IDS.indexOf(category);
  const sentences = subjects.map((subject, sentenceIndex) =>
    buildSimpleLine(subject, category, storyIndex + categoryOffset, sentenceIndex + tier),
  );
  return {
    id: storyId,
    title: storyTitle(entries, storyIndex),
    tier,
    cefr,
    category,
    vocabIds: entries.map((entry) => `${category}-${cefr}-${slugify(entry.en)}`),
    sentences: sentences.map((sentence, sentenceIndex) => ({
      id: `${storyId}-s${sentenceIndex + 1}`,
      pl: sentence.pl,
      steps: buildSteps(sentence.en, tokenPool, storyIndex * 11 + sentenceIndex * 3),
    })),
  };
}

function bootstrap() {
  ensureDir(EXPERIMENTAL_DIR);
  ensureDir(SNAPSHOT_DIR);
  ensureDir(MASTER_DIR);

  for (const fileName of SOURCE_FILES) {
    const sourcePath = path.join(ROOT, 'src/data', fileName);
    const targetPath = path.join(SNAPSHOT_DIR, fileName);
    fs.copyFileSync(sourcePath, targetPath);
  }

  const vocab = [];
  const sentences = [];
  const stories = [];

  for (const category of CATEGORY_IDS) {
    const frames = CATEGORY_CONTEXTS[category].frames;
    for (const tier of TIERS) {
      const bucket = VOCAB_BANKS[category][tier];
      const tokenPool = tokenPoolForBucket(category, bucket);
      const sentenceWords = pickUsableWords(category, bucket, 12);
      const storyPool = pickUsableWords(category, [...bucket.slice(8), ...bucket.slice(0, 8)], 30);
      const storyLength = tier + 1;

      bucket.forEach((entry, index) => {
        vocab.push(makeVocabEntry(category, tier, entry, bucket, index));
      });

      sentenceWords.forEach((entry, index) => {
        sentences.push(
          makeSentenceTask(category, tier, entry, tokenPool, index),
        );
      });

      for (let storyIndex = 0; storyIndex < 10; storyIndex += 1) {
        const storyEntries = [];
        for (let offset = 0; offset < storyLength; offset += 1) {
          const entry = storyPool[(storyIndex * storyLength + offset) % storyPool.length];
          storyEntries.push(entry);
        }
        stories.push(
          makeStory(category, tier, storyEntries, storyIndex, tokenPool),
        );
      }
    }
  }

  writeJson(path.join(MASTER_DIR, 'vocab.json'), vocab);
  writeJson(path.join(MASTER_DIR, 'sentences.json'), sentences);
  writeJson(path.join(MASTER_DIR, 'stories.json'), stories);
}

bootstrap();
