/**
 * Targeting helpers for the Navigation tab.
 *
 * Uses Foundry's core targeting (`Token#setTarget` / `User#targets`). Multiple
 * targets may be toggled on/off independently, chosen from all tokens on the
 * active scene.
 */

/**
 * All non-hidden tokens on the active scene, sorted by name.
 * @returns {Token[]}
 */
export function getSceneTokens() {
  if (!canvas?.ready) return [];
  return canvas.tokens.placeables
    .filter((t) => !t.document.hidden)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/**
 * Whether the current user is currently targeting the given token.
 * @param {Token} token
 * @returns {boolean}
 */
export function isTargeted(token) {
  return game.user.targets.has(token);
}

/**
 * Toggle the current user's target state for a token (multi-target: does not
 * release other targets).
 * @param {Token} token
 */
export function toggleTarget(token) {
  if (!token) return;
  token.setTarget(!isTargeted(token), { user: game.user, releaseOthers: false });
}
