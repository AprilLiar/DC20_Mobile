/**
 * Mobile-device detection and activation logic.
 *
 * The module activates its mobile UI when EITHER the per-client `mobileMode`
 * setting forces it on, OR the setting is "auto" and the current device looks
 * like a touch/mobile device. Game Masters keep the desktop UI unless they
 * explicitly force mobile mode on (handy for testing).
 */

import { MODULE_ID } from "./const.mjs";

/**
 * Heuristic check for whether the current client is a phone/tablet.
 * Combines a touch capability check with either a mobile user-agent hint or a
 * small viewport, so desktops with touchscreens are not misclassified.
 * @returns {boolean}
 */
export function isMobileDevice() {
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0 || "ontouchstart" in window;
  const uaMobile = /Mobi|Android|iPhone|iPad|iPod|Tablet|Touch/i.test(navigator.userAgent ?? "");
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 820;
  return hasTouch && (uaMobile || smallViewport);
}

/**
 * Decide whether the mobile UI should be active for this client/user.
 * @returns {boolean}
 */
export function shouldActivate() {
  const mode = game.settings.get(MODULE_ID, "mobileMode");
  if (mode === "off") return false;
  if (mode === "on") return true; // explicit override applies to anyone (incl. GM)
  // mode === "auto": players only, based on device heuristic.
  if (game.user.isGM) return false;
  return isMobileDevice();
}
