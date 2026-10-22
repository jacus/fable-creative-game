# Smocza Poczta – Wyspy Snów / Dragon Mail – Dream Islands

A dreamy 2.5D flying game for kids (5–8). You are a little dragon postman: fly through a sky of floating islands, collect stars, blow grumpy storm clouds away with fire breath, and land on islands where friendly creatures ask you a small riddle before you can deliver their letter. Counting, colours, shapes, letters, reading, adding, subtracting, patterns and "odd one out", scaled by age. Every riddle is read aloud (Polish or English), so a child who cannot read yet can play alone.

Made for [kubartek.com](https://kubartek.com).

## Play

Open `index.html` (any static server, or straight from the folder). No build step, no dependencies, no images: everything is drawn in code.

- **Keyboard:** hold `Space` / `↑` to flap up, release to glide. `F` / `Shift` fire breath. `←` `→` slower / faster. `P` pause, `M` sound.
- **Touch:** hold the screen to fly up, let go to glide. 🔥 button for fire.
- Fly through the glowing ring above an island to land. Answer the friend's riddle, get the letter delivered, the island lights up, a friend lands in your album.
- Stars collected in a row build a **combo** (x2 / x3 / x4). Grumpy clouds knock it down; fire breath pops them into stars.
- Delivered letters unlock dragon colours (3, 8, 15, 25). The sky cycles through dawn, day, sunset and night; island biomes change every four islands (meadow, candy, dino, ice, crystal).

## Languages

`?lang=pl|en` → remembered choice → browser language. In-game selector on the start screen. The language of the riddle *words* (letters / reading) is a separate setting, so a Polish child can practise English words and vice versa.

## Files

- `index.html` – start screen, HUD, riddle card, album, pause (bilingual with `data-en` attributes).
- `style.css` – layout, phone and desktop.
- `lang.js` – language contract (same as the other Kubartek games).
- `quiz.js` – riddle generators and the word list.
- `audio.js` – Web Audio synth (music box pad, effects) and speech.
- `game.js` – world, procedural art (islands, creatures, dragon, clouds), physics, render pipeline with a low-res bloom pass.

Settings and progress (stars, delivered letters, friends, unlocked dragons) live in `localStorage`. No network calls except Google Fonts.
