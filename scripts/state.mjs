/**
 * Shared selection state for the mobile UI.
 *
 * A single "selected actor" drives both the Navigation tab (which token the
 * D-pad moves) and the Character tab (which sheet is shown). Only actors of
 * type `character` that the current user owns are eligible.
 */

let _selectedActorId = null;

/**
 * All `character`-type actors the current user has Owner permission on.
 * @returns {Actor[]}
 */
export function getOwnedCharacters() {
  return game.actors.filter((a) => a.type === "character" && a.isOwner);
}

/**
 * The currently selected character. Falls back to the user's assigned
 * character, then the first owned character. Returns null if the user owns none.
 * @returns {Actor|null}
 */
export function getSelectedActor() {
  const characters = getOwnedCharacters();
  if (!characters.length) return null;

  let actor = characters.find((a) => a.id === _selectedActorId);
  if (!actor) {
    const assigned = game.user.character;
    actor = (assigned && characters.find((a) => a.id === assigned.id)) || characters[0];
    _selectedActorId = actor.id;
  }
  return actor;
}

/**
 * Set the selected character by id (ignored if not an owned character).
 * @param {string} id
 */
export function setSelectedActor(id) {
  if (getOwnedCharacters().some((a) => a.id === id)) _selectedActorId = id;
}
