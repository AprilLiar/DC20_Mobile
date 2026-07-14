/**
 * DC20 Mobile — module entry point.
 *
 * Registers the per-client mobile-mode setting, evaluates device detection on
 * ready, and toggles the full-screen mobile UI (MobileShell) accordingly. While
 * active, a body class hides the desktop interface via CSS.
 */

import { MODULE_ID, ALT_SHEET_MODULE_ID } from "./const.mjs";
import { shouldActivate, isMobileDevice } from "./detection.mjs";
import { MobileShell } from "./apps/mobile-shell.mjs";

export { MODULE_ID };

/** @type {MobileShell|null} The live shell instance, when mobile mode is active. */
let shell = null;

/** Whether the mobile UI is currently active. */
export function isActive() {
  return shell !== null;
}

/**
 * Measure the actual browser viewport width (excludes scrollbar, matches what
 * the device truly renders) and publish it as --dc20-mobile-vw so CSS can use
 * it instead of 100vw, which can overshoot by the scrollbar width.
 */
function syncViewportWidth() {
  document.documentElement.style.setProperty("--dc20-mobile-vw", window.innerWidth + "px");
}

/* --------------------------------------------------------------------------
 * Canvas throttling
 *
 * The Pixi.js ticker keeps running at 60fps even when the canvas is hidden by
 * CSS. On iOS, the GPU load this creates causes the browser to kill the tab
 * under memory pressure. While mobile mode is active we cap the ticker to 2fps
 * (enough for the engine to process updates but essentially free in GPU terms).
 * We also fully stop the ticker when the page is backgrounded and restart it
 * (still capped) when the page comes back — this also reduces the chance of a
 * WebSocket timeout triggering Foundry's force-reload.
 * -------------------------------------------------------------------------- */
const MOBILE_TICKER_FPS = 2;
let _savedTickerMaxFPS = null;

function _getCanvasTicker() {
  return canvas?.app?.ticker ?? null;
}

function throttleCanvas() {
  const t = _getCanvasTicker();
  if (!t) return;
  _savedTickerMaxFPS = t.maxFPS;
  t.maxFPS = MOBILE_TICKER_FPS;
}

function unthrottleCanvas() {
  const t = _getCanvasTicker();
  if (!t) return;
  t.maxFPS = _savedTickerMaxFPS ?? 0;
  _savedTickerMaxFPS = null;
}

function _pauseCanvasTicker() {
  const t = _getCanvasTicker();
  if (t?.started) t.stop();
}

function _resumeCanvasTicker() {
  const t = _getCanvasTicker();
  if (!t) return;
  if (!t.started) t.start();
  t.maxFPS = MOBILE_TICKER_FPS;
}

/**
 * Page Visibility handler. When iOS backgrounds the tab the WebSocket may time
 * out; Foundry reacts by reloading. Pausing the ticker while hidden reduces
 * memory/CPU pressure and buys more time before the OS kills the tab. On
 * return we restart at the throttled rate rather than full 60fps.
 */
function _onVisibilityChange() {
  if (!isActive()) return;
  if (document.visibilityState === "hidden") {
    _pauseCanvasTicker();
  } else {
    _resumeCanvasTicker();
  }
}

/** Activate the mobile UI: hide the desktop interface and render the shell. */
export function activateMobile() {
  if (shell) return;
  syncViewportWidth();
  window.addEventListener("resize", syncViewportWidth);
  document.addEventListener("visibilitychange", _onVisibilityChange);
  throttleCanvas();
  document.body.classList.add("dc20-mobile-active");
  shell = new MobileShell();
  shell.render(true);
}

/** Deactivate the mobile UI and restore the desktop interface. */
export function deactivateMobile() {
  window.removeEventListener("resize", syncViewportWidth);
  document.removeEventListener("visibilitychange", _onVisibilityChange);
  unthrottleCanvas();
  // Ensure the ticker is running again if we paused it while hidden.
  const t = _getCanvasTicker();
  if (t && !t.started) t.start();
  document.body.classList.remove("dc20-mobile-active");
  shell?.close();
  shell = null;
}

/** Re-render the shell if active (debounced to absorb rapid game events). */
const requestRefresh = foundry.utils.debounce(() => {
  if (shell) shell.render();
}, 100);

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "mobileMode", {
    name: "DC20MOBILE.Settings.MobileMode.Name",
    hint: "DC20MOBILE.Settings.MobileMode.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "auto",
    choices: {
      auto: "DC20MOBILE.Settings.MobileMode.Auto",
      on: "DC20MOBILE.Settings.MobileMode.On",
      off: "DC20MOBILE.Settings.MobileMode.Off",
    },
    onChange: () => (shouldActivate() ? activateMobile() : deactivateMobile()),
  });

  // v14 moved loadTemplates; fall back to the global for older builds.
  const loadTemplates = foundry.applications.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  loadTemplates([`modules/${MODULE_ID}/templates/navigation.hbs`]);
});

/**
 * On a phone/tablet, scale the DC20 Alternative Character Sheet down so it fits
 * the smaller screen: UI scale 0.75 (its minimum) and font size 1. Both are
 * client-scoped settings on the alt-sheet module, so this only affects this
 * device and won't change other players' preferences. No-op if the alt-sheet
 * module isn't active, its settings aren't registered yet, or the value already
 * matches (avoids a redundant re-render).
 */
async function applyMobileAltSheetDefaults() {
  if (!isMobileDevice()) return;
  if (game.modules.get(ALT_SHEET_MODULE_ID)?.active !== true) return;

  const desired = { uiScale: 0.75, fontScale: 1 };
  for (const [key, value] of Object.entries(desired)) {
    const id = `${ALT_SHEET_MODULE_ID}.${key}`;
    if (!game.settings.settings.has(id)) continue;
    if (game.settings.get(ALT_SHEET_MODULE_ID, key) === value) continue;
    try {
      await game.settings.set(ALT_SHEET_MODULE_ID, key, value);
    } catch (err) {
      console.warn(`dc20-mobile | failed to set ${id}`, err);
    }
  }
}

Hooks.once("ready", () => {
  applyMobileAltSheetDefaults();
  if (shouldActivate()) activateMobile();
});

// Keep the Navigation tab in sync with the game state.
for (const hook of ["createToken", "deleteToken", "updateToken", "controlToken"]) {
  Hooks.on(hook, requestRefresh);
}
// canvasReady fires when a new scene is loaded — refresh the shell AND
// re-apply the ticker throttle (the new canvas starts at 60fps by default).
Hooks.on("canvasReady", () => {
  requestRefresh();
  if (isActive()) throttleCanvas();
});
Hooks.on("targetToken", requestRefresh);
Hooks.on("updateActor", requestRefresh);

/**
 * Tag any window that pops up while mobile mode is active (e.g. DC20 roll
 * dialogs) with `dc20-mobile-popup` so the CSS can re-center and size it to the
 * viewport. The shell and the embedded character sheet are left untouched —
 * they have their own fullscreen styling.
 * @param {Application|ApplicationV2} app  The application being rendered.
 * @param {HTMLElement|JQuery} html        Its root element (jQuery on AppV1).
 */
function tagPopupWindow(app, html) {
  if (!isActive()) return;
  if (app === shell || app === shell?._charSheet) return;
  const el = html instanceof HTMLElement ? html : html?.[0] ?? html?.element;
  if (!el?.classList) return;
  if (el.id === "dc20-mobile-shell") return;
  // The embedded character sheet manages its own fullscreen layout.
  if (el.classList.contains("dc20-alt-sheet")) return;
  el.classList.add("dc20-mobile-popup");
}

// AppV1 (legacy) and AppV2 fire different render hooks; cover both.
Hooks.on("renderApplication", tagPopupWindow);
Hooks.on("renderApplicationV2", tagPopupWindow);

// Expose a small API for debugging / manual control.
Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { activateMobile, deactivateMobile, isActive };
});
