/**
 * Token movement helpers for the Navigation D-pad.
 *
 * Works entirely through Scene/TokenDocument APIs so it is compatible with
 * noCanvas mode. Wall-collision checking is omitted (requires canvas). Movement
 * is one grid space per press and is clamped to the padded scene rectangle.
 */

/**
 * Find the TokenDocument for an actor on the active scene.
 * @param {Actor|null} actor
 * @returns {TokenDocument|null}
 */
export function getActorToken(actor) {
  if (!actor) return null;
  return game.scenes.active?.tokens.find((t) => t.actorId === actor.id) ?? null;
}

/**
 * Move a token one grid space in the given direction.
 * @param {TokenDocument} tokenDoc
 * @param {number} dx -1, 0, or 1 (horizontal)
 * @param {number} dy -1, 0, or 1 (vertical)
 * @returns {Promise<boolean>} true if the token moved
 */
export async function stepToken(tokenDoc, dx, dy) {
  if (!tokenDoc || (dx === 0 && dy === 0)) return false;

  const scene = game.scenes.active;
  if (!scene) return false;

  const size = scene.grid.size;
  const newX = tokenDoc.x + dx * size;
  const newY = tokenDoc.y + dy * size;

  // Clamp inside the padded scene rectangle.
  const padX = Math.ceil(scene.width * scene.padding);
  const padY = Math.ceil(scene.height * scene.padding);
  const tokenW = (tokenDoc.width ?? 1) * size;
  const tokenH = (tokenDoc.height ?? 1) * size;
  const clampedX = Math.clamp(newX, -padX, scene.width + padX - tokenW);
  const clampedY = Math.clamp(newY, -padY, scene.height + padY - tokenH);

  if (clampedX === tokenDoc.x && clampedY === tokenDoc.y) return false;

  await tokenDoc.update({ x: clampedX, y: clampedY });
  return true;
}
