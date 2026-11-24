# Primordia: cell stage (draft)

This is a browser game about evolution under environmental pressure. You guide a lineage of single cells through a sea that keeps changing. Oxygen rises, ice spreads and vents open. Every body part has a real mechanical effect, and every habitat pushes back on the body you build.

This is the first playable draft of the **cell stage**.

## Play it

- **No setup:** open `dist/primordia.html` in a browser. Everything is in that one file.
- **From source:** run `npm run serve` (or `python3 -m http.server 8080`) inside this folder, then open http://localhost:8080. ES modules don't load from `file://`, so the source version needs the local server.

Controls: WASD or arrow keys, or hold the mouse button (or your finger) to swim toward the pointer. Shift sprints. E or Space releases toxin. R divides. Tab opens the ecosystem view, P pauses and the mouse wheel zooms.

## Saving

The game saves automatically every 20 seconds, after each division, and whenever the tab is hidden or closed. **Continue** on the title screen picks up where you left off, and the pause menu has a **Save now** button.

Saves go to two places (`js/save.js`):

- **This browser's localStorage.** Always used, and works offline.
- **A private document in your claude.ai account,** when the game runs as a claude.ai artifact. It lives under `data/users/<your id>/save`, which only you can read. The save is gzip-compressed to about 40 KB, and lets the lineage continue on another device, such as your phone. Writing it needs Contributor access or higher, so view-only visitors get local saves only.

When loading, the newer of the two saves wins. When your lineage dies out, the save is deleted. `npm run savetest` checks that a save and restore round trip keeps the world intact.

## Core loop

1. **Swim, eat, survive.** Food that a cell can't digest gives it nothing, and a mouth only works on the side it faces.
2. **Grow.** Spare energy fills the Division bar.
3. **Divide.** The editor opens with:
   - **Three free mutation offers.** They are weighted by what this generation actually went through (stress-induced mutation). For example, time spent near your cold limit brings up Antifreeze, and attacks from behind bring up rear armor or spikes.
   - **DNA spending.** You can buy any unlocked part, change size or membrane thickness, and move parts around.
     - Each part tile has **− / +** buttons. Plus places a copy at a sensible spot. Minus takes back copies added this division, but never goes below what your cell already had. Losing an inherited part is a separate, deliberate action on the selected part.
     - The cell view zooms (buttons, mouse wheel or pinch) and pans (drag empty space).
     - The **On this cell** list selects any part, even where parts overlap; clicking an overlapping spot again cycles through the parts there. A selected part can be rotated in 15° steps or with a slider.
     - The DNA / Cost / Left readout is pinned to the Divide bar, so it stays visible while you scroll.
   - **Live stats and a habitat forecast.** These show how the new body would do in each habitat, both now and in the next era.
4. **Your lineage persists.** Each division adds a sibling. If you die you continue as the nearest relative. If every member dies, the lineage is extinct.

## Systems

### Environment (`js/environment.js`)

The pond is 3600×3600 µm. Static fields cover depth, vents, sulfur seeps, cold currents and swirling currents. Each point has five conditions:

| Condition | Source | Body interaction |
|---|---|---|
| Temperature | Depth, cold currents, vents, era | Tolerance range from Antifreeze, Heat-Shock Proteins and size. Cold water is also more viscous, so swimming is slower and cilia lose power. |
| Light | Depth, ice cover, era | Chloroplasts turn light into energy. Low light reduces vision. |
| UV | Bright water × era (no ozone at first) | Pigment raises the UV limit. |
| Oxygen | Era baseline + local photosynthesis − sulfur | Peroxisomes raise the oxygen limit. Mitochondria cut energy costs when oxygen is high. |
| Sulfur | Vents, seeps, volcanic eras | Sulfide Enzymes raise the limit and resist toxin clouds. Symbionts turn sulfur into energy. |

Photosynthesizers really do add oxygen to the water around them.

**Eras** run about 4–5 minutes each, with 40-second transitions and a visible forecast. The first is *Primordial Warmth* (no oxygen, harsh UV), followed by the *Great Oxidation*. After that the sequence is random among *Global Glaciation*, *Volcanic Upheaval* (new vents open), *Age of Blooms* and *Oxidation*.

### Body (`js/parts.js`, `js/genome.js`)

There are 19 parts in 6 categories. External parts sit on the membrane at an angle, and that angle matters:

- A flagellum pushes hardest from the rear and wastes energy on the side.
- Mouths, spikes, armor and eyes each cover an arc. Armor blocks 60% of the damage coming from its side.

`phenotype()` turns a genome into every number the simulation uses: speed, turning, HP, upkeep, vision, tolerances, digestion, bite and so on.

### Sight (`js/vision.js`)

Every cell senses its surroundings a short way in all directions. Eyes add range in the direction they face, so placement matters: front-facing eyes leave you blind behind. Eyes also need light, though bioluminescence keeps them partly useful in the dark.

Eyes evolve in tiers. Each tier adds **range** and **clarity**:

| Eye | Clarity | What you get |
|---|---|---|
| none | Light and dark | Beyond a short distance, other cells are blurry glows |
| Eyespot (8 DNA, unlocked from the start) | Shapes | You see other cells' bodies and parts |
| Eye Cup | Detail | Threats are ringed red and prey green |
| Ocelloid | Sharp | Species name tags and off-screen predator arrows |

How fast sight improves:
- Living a generation with an eye unlocks its next tier, which you can then buy as an in-place upgrade in the editor (10–12 DNA).
- An eye mutation is guaranteed at every division until your lineage has an eye cup, so decent sight takes about two divisions.
- AI cells use the same directional sight. Eyeless cells can't tell hunters from harmless cells, so they flee anything large.

Out-of-sight cells show only as faint bioluminescent glows. With an eyespot or better, those glows carry the species colour. The editor shows a top-down diagram of what the new body can see, compared with the current one.

### Ecosystem (`js/world.js`, `js/ai.js`, `js/species.js`)

- About 7 founding AI species plus your own. AI cells flee, hunt (leading the target and sprinting at the end), graze, and probe nearby water to move toward conditions they tolerate.
- AI divisions mutate. Stressed cells are more likely to mutate toward relief, and genomes that drift far enough from their founder become a **new species** with a generated name. Selection happens on its own: bodies that suit the current era multiply.
- Migrants recolonize empty habitats, and a population floor stops a mass extinction from emptying the pond.
- **Horizontal gene transfer:** eating cells or their remains can unlock their parts for you.

### Other files

- `js/pressures.js`: tracks the stress your generation experienced and builds the mutation offers.
- `js/biology.js`: shared rules for environmental damage, energy income and the habitat-fit score.
- `js/render.js`, `js/cellDraw.js`: Canvas 2D renderer in the Deep Glow style (visual concept B), with procedurally animated, glowing cells and sight-shaped darkness.
- `js/hud.js`, `js/editor.js`, `js/eco.js`, `js/main.js`: UI and the game loop.

## Tooling

- `npm run simtest -- 12 42 --player --start=vents` runs the ecosystem headless for 12 minutes and prints populations, era changes and causes of death. The simulation has no DOM code, so it runs in Node. Use it when changing balance numbers.
- `npm run build` bundles everything into `dist/primordia.html` (needs `npm install` once for esbuild).

## Known gaps and next steps

- Balance is first-pass. Specialist founders (vent and cold dwellers, armored grazers) still tend to die out within the first few eras, and migrants refill their niches. Predators are fairly weak.
- No save or load yet.
- No sound.
- Touch controls work, but the editor is mouse-first.
- Ideas for the next draft:
  - Food-web and cause-of-death charts in the ecosystem view.
  - Cell colonies (a first step toward multicellularity).
  - Symbiosis events (engulfing a bacterium to gain mitochondria or chloroplasts).
  - A tutorial era.
