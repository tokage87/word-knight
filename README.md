# Word Knight

A browser-based side-scrolling auto-battler that teaches English vocabulary to Polish-speaking children (ages 10–13, A1–A2). The knight fights automatically — the player's only job is answering English quizzes. Correct answers reduce all spell cooldowns by 5 seconds. Without quiz answers, the knight will die.

Built with Vite + TypeScript + Phaser 3. Ships as a static site to GitHub Pages.

## Local development

```bash
npm install
npm run dev
```

Opens at http://localhost:5173/.

## Production build

```bash
npm run build
npm run preview
```

Build output lands in `dist/`. The preview command serves the built bundle locally.

## Deploy to GitHub Pages

1. Push this repo to GitHub (tentative name: `word-knight`).
2. Repo → **Settings** → **Pages** → set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys automatically.
4. The Pages URL appears in the Actions run summary.

`vite.config.ts` sets `base: './'`, so asset paths work from any subdirectory.

## Milestone 1 scope (current)

- Auto-walking knight, one slime type, auto-melee combat.
- One spell (**Fire**, 30s base cooldown, AoE on 2+ visible enemies).
- One quiz type: translate PL → EN, 10 inline vocab entries.
- HUD: HP bar, distance counter, Fire cooldown bar.
- Placeholder colored-rectangle "sprites" via `src/constants/assetKeys.ts`.

## Planned milestones

| M  | Work                                                                    |
|----|-------------------------------------------------------------------------|
| M2 | Ice + Heal spells with priority logic (Heal > Fire > Ice).              |
| M3 | Move vocab / enemies / spells / chambers from inline to JSON.           |
| M4 | Bat + skeleton enemies.                                                 |
| M5 | Chamber progression — background palette swaps every 200 m.             |
| M6 | Picture-pick and fill-in-blank quiz types.                              |
| M7 | Web Speech API pronunciation on correct answer (`lang: 'en-US'`, 0.9x). |
| M8 | Swap placeholder rectangles for real pixel art sprite sheets.           |
| M9 | Sound effects (freesound.org).                                          |
| M10| Polish: screen shake, tween damage numbers, chamber transitions.        |

## Project layout

```
src/
  main.ts                   Phaser bootstrap
  scenes/
    BootScene.ts            generates placeholder textures
    GameScene.ts            gameplay loop
    UIScene.ts              HUD + quiz DOM overlay
  entities/
    Knight.ts, Enemy.ts
  systems/
    SpellCaster.ts          cooldowns + auto-cast
    WaveSpawner.ts          slime spawn cadence
    QuizManager.ts          quiz selection, validation, DOM mount
  constants/
    assetKeys.ts            one place for sprite keys (easy sprite swap)
    layout.ts               canvas dims, ground Y, knight X
  styles/
    quiz.css                quiz DOM styling
public/assets/sprites/      real pixel art goes here (M8)
```

## Why this exists

The core rule: **the quiz IS the gameplay.** The player never moves the knight, never manually casts spells, never clicks enemies. Their entire interaction is answering vocab questions. This turns repetitive vocabulary practice into survival pressure — silence means death, answering means power. Wrong answers don't punish; they just don't help.
