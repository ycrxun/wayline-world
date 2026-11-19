# Wayline World architecture

Wayline World 将普通 Hugo 内容投影为一个可驾驶世界，同时保持每条内容仍然可以通过常规 URL 访问。

## Runtime layers

```text
Hugo content
    |
    v
layouts/world.json
    |
    v
app.js controller
    |
    +-- world-overlay.html
    +-- reading UI / badge persistence
    |
    v
world.js
    |
    +-- Three.js renderer
    +-- terrain / road / landmarks
    +-- vehicle and timeline nodes
    +-- WebGL input and camera
```

## Files

| Path | Responsibility |
| --- | --- |
| `layouts/_partials/world-overlay.html` | Full-screen world markup and asset URLs |
| `layouts/world.json` | Projects posts, resume data, and gallery items into `/world/index.json` |
| `assets/js/app.js` | Opens the world, renders HUD, controls reader, persists badges |
| `assets/js/world.js` | Three.js scene, terrain, road, driving, timeline, pointer picking |
| `assets/scss/_world.scss` | World HUD, reader, reward, responsive controls |
| `static/models/` | Self-hosted vehicle, tree, HDR environment |

## Content projection

The 3D world does not parse Markdown itself. Hugo renders three arrays:

```json
{
  "archive": [],
  "about": [],
  "gallery": []
}
```

Each item carries a date, title, subtitle, description, URL, image, rendered HTML, and tags. `world.js` places those items at equal arc-length intervals along the road.

## Runtime boundaries

- `app.js` owns DOM and persistence.
- `world.js` owns WebGL and scene state.
- `world.json` owns content projection.
- `_world.scss` owns visual presentation.
- Three.js and its loaders are loaded only when the world opens.

The world can therefore be embedded into another Wayline-compatible theme without copying its blog layouts.

## Adding a new timeline

1. Add an array to `layouts/world.json`.
2. Add its color in `timelineColors` in `world.js`.
3. Add a beacon definition in `world.js`.
4. Add a navigation button with `data-world-section`.
5. Add its mission label in `app.js`.

The same item schema and reading UI can be reused.
