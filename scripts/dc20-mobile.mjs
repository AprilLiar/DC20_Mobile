/**
 * DC20 Mobile — module entry point.
 *
 * Registers the per-client mobile-mode setting, then — before the Foundry
 * canvas initialises — sets core.noCanvas=true for mobile clients. This
 * eliminates the Pixi.js/WebGL context entirely, which is the root cause of
 * iOS tab kills under memory pressure. One automatic reload happens on first
 * activation; every subsequent load starts with noCanvas already set.
 *
 * All movement/targeting code uses Scene/TokenDocument APIs (no canvas needed).
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
 * Measure the actual browser viewport width (excludes scrollbar) and publish
 * it as --dc20-mobile-vw so CSS can use it instead of 100vw.
 */
function syncViewportWidth() {
  document.documentElement.style.setProperty("--dc20-mobile-vw", window.innerWidth + "px");
}

/* --------------------------------------------------------------------------
 * noCanvas management
 *
 * We set core.noCanvas=true for mobile clients so Pixi.js/WebGL never
 * initialises. This is the only reliable fix for iOS killing tabs under GPU
 * memory pressure. We record in localStorage whether WE enabled it so that
 * turning mobile mode off restores the previous state without wiping a value
 * the user may have set themselves.
 * -------------------------------------------------------------------------- */
const _NO_CANVAS_OWNER_KEY = "dc20-mobile.ownsNoCanvas";

function _applyNoCanvas() {
  if (game.settings.get("core", "noCanvas")) return; // already off — nothing to do
  localStorage.setItem(_NO_CANVAS_OWNER_KEY, "1");
  game.settings.set("core", "noCanvas", true); // triggers Foundry's debounced reload
}

function _restoreCanvas() {
  if (!localStorage.getItem(_NO_CANVAS_OWNER_KEY)) return; // we didn't set it
  localStorage.removeItem(_NO_CANVAS_OWNER_KEY);
  if (game.settings.get("core", "noCanvas")) {
    game.settings.set("core", "noCanvas", false); // triggers Foundry's debounced reload
  }
}

/** Activate the mobile UI: hide the desktop interface and render the shell. */
export function activateMobile() {
  if (shell) return;
  syncViewportWidth();
  window.addEventListener("resize", syncViewportWidth);
  document.body.classList.add("dc20-mobile-active");
  shell = new MobileShell();
  shell.render(true);
}

/** Deactivate the mobile UI and restore the desktop interface. */
export function deactivateMobile() {
  window.removeEventListener("resize", syncViewportWidth);
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
    onChange: () => {
      if (shouldActivate()) {
        if (!game.settings.get("core", "noCanvas")) {
          _applyNoCanvas(); // triggers reload to set noCanvas
        } else if (!isActive()) {
          activateMobile(); // noCanvas already set, just show the UI
        }
      } else {
        if (isActive()) deactivateMobile();
        _restoreCanvas(); // remove noCanvas if we set it (triggers reload)
      }
    },
  });

  // Apply (or restore) noCanvas before the canvas initialises — this is the
  // correct moment because canvas init happens after all init hooks run.
  if (shouldActivate()) {
    _applyNoCanvas(); // no-op if already set; otherwise sets + queues reload
  } else {
    _restoreCanvas(); // no-op if we didn't set it; otherwise restores + reloads
  }

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

// Keep the Navigation tab in sync with game-state changes.
// Only document-level hooks are used — canvas hooks don't fire in noCanvas mode.
for (const hook of ["createToken", "deleteToken", "updateToken"]) {
  Hooks.on(hook, requestRefresh);
}
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
