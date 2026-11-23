# Visual concept renderer

`styles.html` draws the same game moment (scene) and the same four creatures (lineup) in seven art directions, from the same body data the game uses:

| Key | Concept |
|---|---|
| `phase` | A · Under the Lens (phase-contrast microscopy) |
| `glow` | B · Deep Glow (bioluminescence) |
| `plate` | C · Field Journal (naturalist plate) |
| `paper` | D · Cut Paper (paper diorama) |
| `riso` | E · Riso Zine (three-ink risograph) |
| `thermal` | F · Field Sensor (thermal instrument view) |
| `gel` | G · Gel Toys (soft 3D) |

To regenerate the example images: `node render-examples.cjs <output-folder>`. This needs Playwright and writes `<style>-scene.jpg` and `<style>-lineup.jpg` for each style.

Each style object (`bg`, `food`, `cell`, `overlay`) is a starting point for a real renderer in `js/render.js` and `js/cellDraw.js`.
