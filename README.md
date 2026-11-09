# Water Splash

Water Splash is a browser arcade game built with HTML, CSS, and the HTML Canvas API. Dodge floating logs, score points, and see how many levels you can reach.

## Features

- Animated title screen and water background
- Water-drop player, floating log obstacles, and splash/near-miss effects
- Keyboard, mouse, and touch controls
- Pause and resume
- Levels that increase as your score grows
- Sound effects generated in the browser; no sound files or external libraries required
- Local leaderboard and best score stored in the browser
- Responsive design and high-DPI canvas rendering
- Static files suitable for GitHub Pages

## Run locally

There are no dependencies or build steps. Open `index.html` in a modern browser, or start a local web server:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Controls

- **Left / Right arrow** or **A / D**: move
- **Mouse or touch**: tap or drag in the game area to steer
- **P** or **Escape**: pause or resume
- Use **Sound on/off** to toggle sound effects

## Leaderboard note

The leaderboard is local to the current browser and device. Scores are stored using `localStorage`; they are not uploaded or shared with other players. A shared, online leaderboard would require a backend service.

## Deploy to GitHub Pages

1. Commit `index.html`, `styles.css`, and `game.js` to the repository.
2. Open the repository on GitHub and go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the branch containing these files and choose the repository root (`/`) as the folder.
5. Save. GitHub Pages will show the published site URL in the Pages settings.

Because the game uses relative asset paths and has no build step, it can be served directly from the repository root.

## Project files

- `index.html` — page markup
- `styles.css` — layout, visual design, and animations
- `game.js` — gameplay, rendering, controls, effects, and local leaderboard
- `LICENSE` — project license

## Live Github Page
https://ghana-gpt.github.io/Water-Splash-Game/
