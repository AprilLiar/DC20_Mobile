/**
 * DC20 Mobile — module entry point.
 *
 * Registers the per-client mobile-mode setting, evaluates device detection on
 * ready, and toggles the full-screen mobile UI (MobileShell) accordingly. While
 * active, a body class hides the desktop interface via CSS.
 */

import { MODULE_ID } from "./const.mjs";
import { shouldActivate } from "./detection.mjs";
import { MobileShell } from "./apps/mobile-shell.mjs";

export { MODULE_ID };

/** @type {MobileShell|null} The live shell instance, when mobile mode is active. */
let shell = null;

/** Whether the mobile UI is currently active. */
export function isActive() {
  return shell !== null;
}

/** Activate the mobile UI: hide the desktop interface and render the shell. */
export function activateMobile() {
  if (shell) return;
  document.body.classList.add("dc20-mobile-active");
  shell = new MobileShell();
  shell.render(true);
}

/** Deactivate the mobile UI and restore the desktop interface. */
export function deactivateMobile() {
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

  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/navigation.hbs`,
  ]);
});

Hooks.once("ready", () => {
  if (shouldActivate()) activateMobile();
});

// Keep the Navigation tab in sync with the game state.
for (const hook of ["createToken", "deleteToken", "updateToken", "canvasReady", "controlToken"]) {
  Hooks.on(hook, requestRefresh);
}
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
  if (el.classList.contains("dc20-sheet-fullscreen") || el.classList.contains("dc20-sheet-hidden")) return;
  el.classList.add("dc20-mobile-popup");
}

// AppV1 (legacy) and AppV2 fire different render hooks; cover both.
Hooks.on("renderApplication", tagPopupWindow);
Hooks.on("renderApplicationV2", tagPopupWindow);

// Expose a small API for debugging / manual control.
Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { activateMobile, deactivateMobile, isActive };
});
