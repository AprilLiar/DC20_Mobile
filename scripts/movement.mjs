/**
 * Token movement helpers for the Navigation D-pad.
 *
 * Movement is one grid space per press and respects walls: a move into a square
 * blocked by a movement-blocking wall is rejected. The token is updated through
 * the normal document pipeline so the standard movement animation runs.
 */

/**
 * Find the placed token for an actor on the active scene.
 * @param {Actor|null} actor
 * @returns {Token|null}
 */
export function getActorToken(actor) {
  if (!actor || !canvas?.ready) return null;
  return canvas.tokens.placeables.find((t) => t.actor?.id === actor.id) ?? null;
}

/**
 * Whether a straight move between two points is blocked by a wall.
 * @param {{x:number,y:number}} origin
 * @param {{x:number,y:number}} destination
 * @returns {boolean}
 */
function isBlockedByWall(origin, destination) {
  try {
    const backend = CONFIG.Canvas?.polygonBackends?.move;
    if (backend?.testCollision) {
      return backend.testCollision(origin, destination, { type: "move", mode: "any" });
    }
    if (canvas.walls?.checkCollision) {
      const ray = new foundry.canvas.geometry.Ray(origin, destination);
      return canvas.walls.checkCollision(ray, { type: "move", mode: "any" });
    }
  } catch (err) {
    console.warn("dc20-mobile | wall collision check failed, allowing move", err);
  }
  return false;
}

/**
 * Move a token one grid space in the given direction, if not blocked.
 * @param {Token} token
 * @param {number} dx -1, 0, or 1 (horizontal)
 * @param {number} dy -1, 0, or 1 (vertical)
 * @returns {Promise<boolean>} true if the token moved
 */
export async function stepToken(token, dx, dy) {
  if (!token || !canvas?.ready || (dx === 0 && dy === 0)) return false;

  const size = canvas.grid.size;
  const origin = token.center;
  const destination = { x: origin.x + dx * size, y: origin.y + dy * size };

  if (isBlockedByWall(origin, destination)) return false;

  // Clamp the new top-left corner inside the padded scene rectangle.
  const rect = canvas.dimensions.rect;
  const tokenW = token.document.width * size;
  const tokenH = token.document.height * size;
  const newX = Math.clamp(token.document.x + dx * size, rect.x, rect.right - tokenW);
  const newY = Math.clamp(token.document.y + dy * size, rect.y, rect.bottom - tokenH);

  if (newX === token.document.x && newY === token.document.y) return false;

  await token.document.update({ x: newX, y: newY }, { animate: true });
  return true;
}
