// Centralized interface strings (Polish).
//
// SCOPE — UI chrome only:
//   • Every hardcoded string the player sees in menus, HUD, overlays,
//     task panels, tooltips, aria-labels and placeholders lives here.
//   • Curriculum CONTENT (vocab / sentences / stories from src/data
//     JSON, plus the gate payloads in CityBranches — prompts, hints,
//     example sentences) is NOT interface text and stays where it is.
//   • Skill-tree node labels/descriptions stay with the tree data in
//     src/systems/SkillTreeDefs.ts ("tree labels live with tree data");
//     doubling that indirection here would not make a second locale
//     easier, since the tree file is already a single data module.
//   • Developer-facing error messages (e.g. src/systems/speech.ts) are
//     intentionally left inline.
//
// ADDING A LOCALE — create a sibling module (e.g. strings.en.ts) with
// the same shape and swap the `STR` export (or pick at startup). Every
// consumer imports only `STR`, so the interface language is a one-file
// change. Strings with interpolations are exported as small functions
// so word order can differ per language.
//
// IMPORTANT: values here must stay byte-identical to what the UI
// rendered before extraction — several panels build HTML via template
// literals around these pieces.

import type { CurriculumCategory, CurriculumSource } from '../systems/CurriculumTypes';

export const STR = {
  // Shared buttons / labels reused across several panels.
  common: {
    close: 'Zamknij', // aria-label on every panel close button
    back: 'WRÓĆ',
    cancel: 'ANULUJ',
    done: 'GOTOWE',
    next: 'DALEJ',
    save: 'ZAPISZ',
    sentenceProgress: (n: number, total: number) => `Zdanie ${n} / ${total}`,
  },

  quiz: {
    prompt: 'Przetłumacz',
  },

  // SentenceBuilder (level-up sentence / story gate).
  sentence: {
    kindStory: 'STORY',
    kindTask: 'TASK',
    subtitleStory: 'Ułóż opowieść',
    subtitleSentence: 'Ułóż zdanie',
    mistakesSuffix: (n: number) => ` · błędy: ${n}`,
  },

  // Level-up reward picker.
  skillPicker: {
    title: 'LEVEL UP!',
    subtitle: 'Choose your reward',
    kindNew: 'NEW',
    kindUpgrade: 'UPGRADE',
    weakenedBadge: 'WEAKENED −50%',
    weakenedTooltip: 'OSŁABIONE −50%',
  },

  // In-run HUD: banners, pause panel, game-over panel, tooltips.
  hud: {
    flowTitle: 'FLOW!',
    flowSub: 'Cooldowny 2× szybciej',
    ultReadyTitle: 'ULTIMATE GOTOWY!',
    ultReadySub: 'Uderza w każdego wroga · 120 s',

    pauseTitle: 'PAUZA',
    pauseSub: 'Naciśnij P aby kontynuować',
    resume: 'KONTYNUUJ',
    toCity: 'MIASTO',
    gameOverTitle: 'KONIEC GRY',
    gameOverSub: 'Twój bieg dobiegł końca — oto jak ci poszło',
    restart: 'RESTART',

    stats: {
      level: 'Zdobyty poziom',
      quizCorrect: 'Poprawne quizy',
      quizWrong: 'Błędne quizy',
      distinctWords: 'Poznane słowa',
      sentenceCorrect: 'Zdania bez błędu',
      sentenceWrong: 'Zdania z błędem',
      storiesPerfect: 'Opowieści ukończone',
      storiesFailed: 'Opowieści nieudane',
      heading: 'Twoje statystyki',
      hpMax: 'Życie (maks.)',
      meleeDamage: 'Obrażenia ataku',
      attackSpeed: 'Szybkość ataku',
      crit: 'Krytyk',
      armor: 'Pancerz',
      lifesteal: 'Wampiryzm',
      dodge: 'Unik',
      regen: 'Regeneracja',
      regenValue: (n: number) => `${n} HP/s`,
    },

    // Live ability tooltips.
    ready: 'Gotowy',
    allyTooltip: (label: string, desc: string, cooldownSec: string, status: string) =>
      `${label}\n${desc}\nOdnowienie: ${cooldownSec}s · ${status}`,
    ultTooltip: (cooldownSec: string, status: string) =>
      `Ultimate — masowe obrażenia wszystkim wrogom na ekranie.\nOdnowienie: ${cooldownSec}s · ${status}\nPoprawna odpowiedź: −3 s · błędna: +1 s`,

    // Static HUD markup pieces.
    goldTooltip: 'Złoto zdobyte za zabicia',
    bossTooltip: 'HP bossa',
    bossLabel: 'BOSS',
    pauseBtnTooltip: 'Pauza (P)',
    ultLockedTooltip: 'Ultimate — odblokowuje się na poziomie 10. Masowe obrażenia.',
    hpTooltip: 'Zdrowie',
    expTooltip: 'Doświadczenie do następnego poziomu',
    expBadge: 'EXP',
    levelLabel: (level: number) => `LV: ${level}`,
    streakTooltip: 'Seria poprawnych odpowiedzi. 5+ = FLOW (cooldowny 2× szybciej)',

    // Ally labels + short descriptions used by the ability-row tooltip.
    // Keep these in sync with src/entities/Ally.ts AllyKind / PROFILES.
    allyLabels: {
      'fire-archer': 'Ognisty Łucznik',
      'fire-monk': 'Ognisty Mnich',
      'ice-archer': 'Lodowy Łucznik',
      'ice-monk': 'Lodowy Mnich',
      cleric: 'Uzdrowiciel',
      'wind-monk': 'Wietrzny Mnich',
      'wind-lancer': 'Wietrzny Lansjer',
      'earth-pawn': 'Ziemny Pionek',
      'earth-lancer': 'Ziemny Lansjer',
    },
    allyDescs: {
      'fire-archer': 'Strzela ognistymi strzałami w najbliższego wroga.',
      'fire-monk': 'Rzuca ciężką kulą ognia w pojedynczego wroga.',
      'ice-archer': 'Strzela lodowymi strzałami, spowalnia wrogów.',
      'ice-monk': 'Ciska lodowym pociskiem z silnym spowolnieniem.',
      cleric: 'Regularnie leczy rycerza podczas walki.',
      'wind-monk': 'Szybko rzuca lekkie pociski wiatru.',
      'wind-lancer': 'Szybkie pchnięcie przeszywające trzech wrogów.',
      'earth-pawn': 'Rąbie toporem blisko rycerza.',
      'earth-lancer': 'Ciężki kamienny pocisk, spowalnia uderzonego wroga.',
    },
    // Locked-slot tooltips in the static ability row (one per ally).
    allyLockedTooltips: {
      'fire-archer': 'Ognisty Łucznik — zablokowany. Odblokuj w Sali Bojowej.',
      'fire-monk': 'Ognisty Mnich — zablokowany. Odblokuj w Sali Bojowej.',
      'ice-archer': 'Lodowy Łucznik — zablokowany. Odblokuj w Bibliotece Magii.',
      'ice-monk': 'Lodowy Mnich — zablokowany. Odblokuj w Bibliotece Magii.',
      cleric: 'Uzdrowiciel — zablokowany. Odblokuj w Bibliotece Magii.',
      'wind-monk': 'Wietrzny Mnich — zablokowany. Odblokuj w Kręgu Uczonych.',
      'wind-lancer': 'Wietrzny Lansjer — zablokowany. Odblokuj w Kręgu Uczonych.',
      'earth-pawn': 'Ziemny Pionek — zablokowany. Odblokuj w Gildii Pisarzy.',
      'earth-lancer': 'Ziemny Lansjer — zablokowany. Odblokuj w Gildii Pisarzy.',
    },
  },

  // City scene (Phaser) + CityOverlay panels.
  city: {
    // Building display names (shared by CityScene map labels,
    // CityOverlay panel headers and task-panel titles).
    branchLabels: {
      combat: 'Sala Bojowa',
      spells: 'Biblioteka Magii',
      scholar: 'Krąg Uczonych',
      writer: 'Gildia Pisarzy',
    },

    scene: {
      title: 'MIASTO',
      newRun: 'NOWA PRZYGODA',
      journal: 'DZIENNIK',
      parentDashboard: 'DLA RODZICA',
      settings: 'USTAWIENIA',
      stallLabel: '🪙 Targowisko',
    },

    // Branch detail panel (gate CTA / skill tree host).
    panel: {
      treeUnlockedLabel: 'Drzewo umiejętności odblokowane',
      treeUnlockedBody: '✓ Odblokowane',
      challengeLabel: 'Wyzwanie:',
      lockedHint: 'Odblokuj to wyzwanie, żeby zobaczyć drzewo umiejętności.',
    },

    // Market stall placeholder panel.
    stall: {
      title: 'Targowisko',
      comingSoonLabel: 'Sklep wkrótce',
      comingSoonBody: 'Kupiec szykuje pierwsze towary. Wpadnij za parę przygód.',
      goldHint:
        'Złoto zdobywasz pokonując wrogów. Im dłuższe pasmo poprawnych odpowiedzi w quizie, tym szybciej zdobywasz monety dzięki przyspieszonym aliantom.',
    },

    // Parent/teacher journal of writing submissions.
    journal: {
      title: 'Dziennik postępów',
      empty: 'Ukończ pierwsze wyzwanie, żeby zobaczyć wpisy tutaj.',
      noEntries: 'Brak wpisów',
      lastEntryPrefix: 'ostatni',
      wordsLabel: 'Słów:',
      distinctLabel: 'Różnych:',
      // Polish plural: 1 wpis, 2-4 wpisy, 5+ wpisów. Handles teens
      // correctly (12 wpisów, not 12 wpisy).
      entryCountWord: (n: number): string => {
        const abs = Math.abs(n);
        if (abs === 1) return 'wpis';
        const last = abs % 10;
        const last2 = abs % 100;
        if (last >= 2 && last <= 4 && (last2 < 12 || last2 > 14)) return 'wpisy';
        return 'wpisów';
      },
      relTime: {
        justNow: 'przed chwilą',
        minutesAgo: (n: number) => `${n} min temu`,
        hoursAgo: (n: number) => `${n} godz. temu`,
        daysAgo: (n: number) => `${n} dni temu`,
        monthsAgo: (n: number) => `${n} mies. temu`,
      },
    },
  },

  // Parent dashboard (weekly bars, totals, backup).
  dashboard: {
    // Sun-first matches Date.getDay()'s 0–6 indexing.
    weekdayLabels: ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'],
    title: 'Dla rodzica',
    wordsKnown: 'Słów poznanych',
    dayStreak: 'Dni z rzędu',
    minutesPlayed: 'Minut zabawy',
    runs: 'Przygód',
    weekActivity: 'Aktywność tygodnia (poprawne odpowiedzi)',
    hardWords: 'Trudne słowa',
    totals: 'Łącznie',
    noHardWords: 'Brak trudnych słów — świetna robota!',
    // `pl` / `en` arrive pre-escaped (HTML context).
    hardWordRow: (pl: string, en: string, correct: number, total: number) =>
      `⚠️ ${pl} (${en}) — ${correct}/${total} poprawnie`,
    barTooltip: (dateKey: string, correct: number, minutes: number) =>
      `${dateKey} · ${correct} poprawnych · ${minutes} min`,
    totalCorrect: (n: number) => `✅ ${n} poprawnych odpowiedzi`,
    totalBosses: (n: number) => `👹 ${n} bossów pokonanych`,
    totalStories: (n: number) => `📚 ${n} historii ułożonych bezbłędnie`,
    totalWriting: (n: number) => `✍️ ${n} zadań pisemnych`,

    backupSection: 'Kopia zapasowa',
    backupHint:
      'Eksportuj kod, żeby zachować postęp lub przenieść go na inne urządzenie. Wklej kod i naciśnij „Wczytaj", żeby przywrócić.',
    backupPlaceholder: 'Tu pojawi się kod kopii — albo wklej swój, żeby przywrócić postęp.',
    backupExport: 'Eksportuj postęp',
    backupImport: 'Wczytaj',
    backupExportFailed: 'Nie udało się utworzyć kodu.',
    backupCopied: 'Skopiowano! Zachowaj kod w bezpiecznym miejscu.',
    backupCopyManually: 'Kod gotowy — skopiuj go z pola powyżej.',
    backupPasteFirst: 'Najpierw wklej kod w polu powyżej.',
    backupImported: 'Wczytano! Postęp przywrócony.',
    backupInvalid: 'Nieprawidłowy kod.',
  },

  // Curriculum picker (USTAWIENIA panel) — interface labels for the
  // source/tier/category selection. The curriculum data itself is content.
  curriculum: {
    title: 'Ustawienia — Plan nauki',
    sourceLabel: 'Źródło:',
    tierLabel: 'Poziom:',
    categoryLabel: 'Kategoria:',
    poolPrefix: 'Aktywna pula:',
    poolVocabWord: 'słówek',
    poolSentencesWord: 'zdań',
    poolStoriesWord: 'opowieści',
    categoryLabels: {
      all: 'Wszystko',
      household: 'Dom',
      school: 'Szkoła',
      food_kitchen: 'Jedzenie',
      animals_nature: 'Zwierzęta',
      town_places: 'Miasto',
      fantasy_adventure: 'Fantasy',
    } satisfies Record<CurriculumCategory, string>,
    sourceLabels: {
      legacy: 'Klasyczny',
      'experimental-tiered': 'Rozszerzony',
      'experimental-a1': 'CEFR A1',
      'experimental-a2': 'CEFR A2',
      'experimental-b1': 'CEFR B1',
      'experimental-de-exam': 'Niemiecki (egzamin)',
    } satisfies Record<CurriculumSource, string>,
    // One-line explanations shown under each source radio. Keep under
    // ~60 chars so they fit inline under the label without wrapping.
    sourceDescriptions: {
      legacy: 'oryginalna lista słówek bez poziomów i tematów',
      'experimental-tiered': 'nowa lista z trzema poziomami i tematami',
      'experimental-a1': 'tylko słownictwo A1 (początkujący)',
      'experimental-a2': 'tylko słownictwo A2 (podstawowy)',
      'experimental-b1': 'tylko słownictwo B1 (średnio zaawansowany)',
      'experimental-de-exam': 'ćwiczenia do egzaminu z niemieckiego',
    } satisfies Record<CurriculumSource, string>,
  },

  // Unlock-gate call-to-action labels shown on the city branch panel
  // before the player starts the gate (re-exported as GATE_CTA in
  // src/systems/UnlockGates.ts).
  gates: {
    cta: {
      writing: { label: 'NAPISZ KRÓTKI TEKST', sublabel: 'Zadanie pisemne po angielsku' },
      listening: { label: 'POSŁUCHAJ I WYBIERZ', sublabel: 'Słuchanie + wybieranie słów' },
      readAloud: { label: 'PRZECZYTAJ NA GŁOS', sublabel: 'Czytanie na głos z mikrofonem' },
      cloze: { label: 'UZUPEŁNIJ ZDANIA', sublabel: 'Gramatyka — wstaw brakujące słowo' },
    },
  },

  // Writing gate task (Gildia Pisarzy).
  writing: {
    title: (branchLabel: string) => `${branchLabel} — zadanie pisemne`,
    placeholder: 'Pisz po angielsku, ile tylko możesz…',
    wordCountLabel: 'Liczba słów',
    hintWordsLabel: 'Słowa z podpowiedzi',
    distinctWordsLabel: 'Różne słowa:',
    scoreLabel: 'Ocena:',
    evaluating: 'Oceniam…',
    // `msg` arrives pre-escaped (HTML context).
    evalFailed: (msg: string) => `Nie udało się ocenić: ${msg}`,
    unknownError: 'nieznany błąd',
    retry: 'Spróbuj ponownie',
    deepLoading: 'Szczegółowa ocena — ładuję model (~2 GB przy pierwszym uruchomieniu, potem cache)',
    webGpuNote: 'Szczegółowa ocena AI wymaga przeglądarki z WebGPU (np. Chrome lub Edge).',
    deepStart: 'Sprawdź szczegółowo (AI)',
    deepNote: 'Pobierze jednorazowo ~2&nbsp;GB przy pierwszym użyciu — potem odpowiedź w kilka sekund.',
  },

  // Listening gate task (Biblioteka Magii).
  listening: {
    title: (branchLabel: string) => `${branchLabel} — słuchanie`,
    instruction: 'Posłuchaj zdania i uzupełnij brakujące słowa z puli poniżej.',
    fillStatus: (n: number) => `Uzupełnij ${n} ${n === 1 ? 'brakujące słowo' : 'brakujące słowa'}.`,
    allCorrect: 'Świetnie! Możesz iść dalej.',
    hasWrong: 'Jedno lub więcej słów jest złe — kliknij w czerwone pole, żeby je wyczyścić.',
    listenButton: 'Odsłuchaj zdanie',
    noTts: 'Twoja przeglądarka nie obsługuje odtwarzania mowy.',
  },

  // Read-aloud gate task (Sala Bojowa).
  readAloud: {
    title: (branchLabel: string) => `${branchLabel} — czytanie na głos`,
    typingPrompt: 'Mikrofon niedostępny. Wpisz zdanie ręcznie, żeby przejść.',
    micPrompt: 'Naciśnij mikrofon i przeczytaj angielskie zdanie na głos.',
    typingMode: 'Typing mode',
    speakAloud: 'Speak aloud',
    typeNote: 'Wpisz zdanie dokładnie tak, jak je widzisz:',
    typePlaceholder: 'Wpisz po angielsku…',
    listeningStatus: 'Słucham… powiedz zdanie wyraźnie i kliknij, gdy skończysz.',
    heardPrefix: 'Usłyszałem:',
    clickMic: 'Kliknij mikrofon i przeczytaj zdanie na głos.',
    attempts: (n: number, max: number) => `Próba ${n} / ${max}`,
    preferTyping: 'Wolę wpisać zdanie',
    micBusy: 'Słucham…',
    micIdle: 'Naciśnij i mów',
  },

  // Cloze gate task (Krąg Uczonych).
  cloze: {
    title: (branchLabel: string) => `${branchLabel} — uzupełnij zdania`,
    instruction: 'Wybierz poprawne słowo, żeby uzupełnić zdanie.',
  },

  // Skill-tree renderer (node badges, tooltips, buy popover). Node
  // labels/descriptions themselves live in SkillTreeDefs.ts.
  skillTree: {
    maxShort: 'Maks.',
    locked: 'Zablokowane',
    goldCost: (n: number) => `${n} złota`,
    maxBadge: 'MAX',
    requires: 'Wymaga:',
    maxReached: 'Osiągnięto maks. poziom.',
    unlockPrereqsFirst: 'Najpierw odblokuj wymagane umiejętności.',
    needGold: (cost: number, have: number) => `Potrzebujesz <b>${cost}</b> złota. Masz ${have}.`,
    buy: 'KUP',
  },

  // DeepJudge (WebLLM) status / fallback strings. The LLM system
  // prompt itself stays in DeepJudge.ts — it is model-facing, not UI.
  deep: {
    ready: 'Gotowe',
    loadFailed: 'Nie udało się załadować modelu',
    noComment: 'Brak komentarza.',
  },
} as const;
