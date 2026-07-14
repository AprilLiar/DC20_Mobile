/**
 * Targeting helpers for the Navigation tab.
 *
 * Works entirely through Scene/TokenDocument APIs so it is compatible with
 * noCanvas mode. We maintain our own Set of targeted token IDs because
 * game.user.targets (canvas Token objects) is unavailable without canvas.
 */

/** @type {Set<string>} Token IDs currently targeted by this user. */
const _targets = new Set();

/**
 * All non-hidden TokenDocuments on the active scene, sorted by name.
 * @returns {TokenDocument[]}
 */
export function getSceneTokens() {
  const scene = game.scenes?.active;
  if (!scene) return [];
  return scene.tokens.contents
    .filter((t) => !t.hidden)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/**
 * Whether the current user is currently targeting the given TokenDocument.
 * @param {TokenDocument} tokenDoc
 * @returns {boolean}
 */
export function isTargeted(tokenDoc) {
  return _targets.has(tokenDoc.id);
}

/**
 * The number of tokens currently targeted by this user.
 * @returns {number}
 */
export function getTargetCount() {
  return _targets.size;
}

/**
 * Toggle the current user's target state for a TokenDocument (multi-target:
 * does not release other targets).
 * @param {TokenDocument|null} tokenDoc
 */
export function toggleTarget(tokenDoc) {
  if (!tokenDoc) return;
  if (_targets.has(tokenDoc.id)) {
    _targets.delete(tokenDoc.id);
  } else {
    _targets.add(tokenDoc.id);
  }
  game.user.updateTokenTargets([..._targets]);
}
