# 🎲 Game Hub

A collection of card and board games, playable in the browser. Hosted on GitHub Pages.

## Live Site

Enable GitHub Pages (Settings → Pages → Source: `main` / root) and visit:
```
https://<your-username>.github.io/game-hub/
```

## Repository Structure

```
game-hub/
├── index.html              ← Hub landing page
├── css/
│   └── hub.css             ← Hub styles
├── js/
│   ├── games.js            ← 🎯 Game registry (edit this to add games)
│   └── hub.js              ← Hub UI logic
├── games/
│   ├── glory-to-rome/
│   │   └── index.html      ← Self-contained game
│   ├── spades/
│   │   └── index.html      ← (future)
│   ├── hearts/
│   │   └── index.html      ← (future)
│   └── five-hundred/
│       └── index.html      ← (future)
├── assets/                  ← Shared images, icons (if needed)
└── README.md
```

## Adding a New Game

### 1. Create the game folder

```
games/your-game-name/
  └── index.html        ← your game (can include its own css/js files)
```

Each game is self-contained in its own folder. A single `index.html` works great for simpler games. For larger games, split into `index.html`, `style.css`, and `game.js` within that folder.

### 2. Register it in the hub

Open `js/games.js` and add an entry:

```js
{
  id: "your-game-name",        // must match the folder name
  title: "Your Game",
  subtitle: "A short tagline",
  category: "card",             // card | board | strategy | party
  players: "2–4",
  duration: "20–30 min",
  icon: "🎴",                  // emoji shown on the hub card
  accentColor: "#e74c3c",      // hex color for card highlight
  status: "playable",          // playable | coming-soon
}
```

That's it — the hub picks it up automatically.

### 3. Add a "Back to Hub" link (optional but recommended)

Add somewhere in your game's UI:
```html
<a href="../../index.html">← Hub</a>
```

## Game Guidelines

- Each game lives in `games/<game-id>/` and is fully self-contained
- Use relative paths for any assets within the game folder
- Games can be single-file HTML or multi-file — the hub doesn't care
- The hub links to `games/<id>/index.html` so that file must exist
