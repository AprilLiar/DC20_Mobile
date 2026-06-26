# DC20 Mobile

Mobile and tablet support for the [DC20 RPG system](https://foundryvtt.com/packages/dc20rpg) on Foundry VTT **v13**.

Desktop players are unaffected. When a **non-GM** user connects from a phone or
tablet, the full desktop interface (canvas, sidebar, chat, controls) is hidden
and replaced with a simplified, **portrait-first** touch UI with two tabs.

## Features

- **Automatic detection** of touch/mobile devices, with a per-client
  `Mobile Mode` setting (`Auto` / `Always On` / `Always Off`) to override it.
  `Always On` is useful for testing the mobile UI on a desktop.
- **Navigation tab**
  - Character switcher across the `character`-type actors you own.
  - A TV-remote-style **8-direction D-pad** that moves the selected character's
    token one grid space per tap. Movement respects walls; blocked moves are
    ignored. If the character has no token on the current scene, the D-pad is
    disabled with a notice.
  - A **Targeting** button listing every token on the scene; tap to toggle
    multiple targets using Foundry's core targeting.
- **Character tab** — the selected actor's existing DC20 character sheet,
  embedded full-screen (the sheet itself is unchanged).

Game Masters keep the normal desktop interface even on mobile (unless they set
`Mobile Mode` to `Always On`).

## Installation

1. Make sure the [DC20 RPG system](https://foundryvtt.com/packages/dc20rpg) is
   installed (this module only loads when the `dc20rpg` system is active).
2. In Foundry, go to **Add-on Modules → Install Module** and paste one of the
   manifest URLs below into the **Manifest URL** field, then click **Install**.
3. Enable **DC20 Mobile** in your world (**Manage Modules**).

### Manifest URL

**Latest release** (recommended — supports in-app update checks):

```
https://github.com/AprilLiar/DC20_Mobile/releases/latest/download/module.json
```

**Current `main` branch** (track the latest development version directly):

```
https://raw.githubusercontent.com/AprilLiar/DC20_Mobile/main/module.json
```

> The latest-release URL requires a GitHub release that attaches `module.json`
> and a packaged `module.zip`, with matching `manifest`/`download` fields in
> `module.json`. Until a release is published, use the `main`-branch manifest
> URL above.

## How it works

| Concern | Approach |
| --- | --- |
| Mobile detection | `navigator.maxTouchPoints` + user-agent + viewport size (`scripts/detection.mjs`) |
| Replacing the UI | `body.dc20-mobile-active` hides the desktop interface via CSS; a frameless `ApplicationV2` shell covers the screen (`scripts/apps/mobile-shell.mjs`) |
| Canvas | Kept initialized but visually hidden, so token/grid math and wall collision still work |
| Movement | One grid step with wall-collision check, then `TokenDocument#update` (`scripts/movement.mjs`) |
| Targeting | `Token#setTarget` with `releaseOthers: false` (`scripts/targeting.mjs`) |
| Character sheet | The DC20 `ActorSheet` instance is rendered and re-parented into the Character tab |

## Project structure

```
module.json
scripts/
  const.mjs          shared constants
  dc20-mobile.mjs    entry: settings, hooks, activate/deactivate
  detection.mjs      device detection + activation logic
  state.mjs          selected-actor state
  movement.mjs       grid-step movement with wall collision
  targeting.mjs      core targeting helpers
  apps/mobile-shell.mjs   ApplicationV2 shell (tabs, D-pad, sheet hosting)
templates/           shell.hbs, navigation.hbs
styles/dc20-mobile.css
lang/en.json
```

## Status

v0.1.0 — initial implementation. Landscape orientation, chat, and dice UI are
out of scope for this version.
