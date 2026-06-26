/**
 * MobileShell — the full-screen, frameless ApplicationV2 that replaces the
 * desktop UI on mobile devices. It hosts two tabs:
 *   - Navigation: character switcher, 8-direction movement D-pad, targeting.
 *   - Character: the DC20 Alternative Character Sheet shown full-screen.
 *
 * For the Character tab we render the alt sheet (an ApplicationV2 ActorSheetV2)
 * once and keep it mounted. Its visibility is driven entirely by the body
 * tab-class (`dc20-tab-character` / `dc20-tab-navigation`) so it never needs to
 * be re-opened or re-positioned when switching tabs or when it re-renders on a
 * value change. CSS targets the sheet's own stable `.dc20-alt-sheet` class.
 */

import { MODULE_ID, ALT_SHEET_MODULE_ID } from "../const.mjs";
import { getOwnedCharacters, getSelectedActor, setSelectedActor } from "../state.mjs";
import { getActorToken, stepToken } from "../movement.mjs";
import { getSceneTokens, isTargeted, toggleTarget } from "../targeting.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @returns {boolean} Whether the alt-sheet module is installed and active. */
export function isAltSheetAvailable() {
  return game.modules.get(ALT_SHEET_MODULE_ID)?.active === true;
}

/**
 * Resolve the alt sheet's class from the actor sheet registry. The module
 * registers it via Actors.registerSheet(ALT_SHEET_MODULE_ID, DC20AltCharacterSheet),
 * so it appears in CONFIG.Actor.sheetClasses.character keyed by module id.
 * @returns {typeof foundry.applications.api.ApplicationV2 | null}
 */
function getAltSheetClass() {
  const registered = CONFIG.Actor?.sheetClasses?.character ?? {};
  for (const entry of Object.values(registered)) {
    if (entry?.id?.startsWith(ALT_SHEET_MODULE_ID) && entry.cls) return entry.cls;
  }
  return null;
}

export class MobileShell extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} The currently visible tab: "navigation" | "character". */
  activeTab = "navigation";

  /** @type {boolean} Whether the targeting list is expanded. */
  targetPanelOpen = false;

  /** @type {ActorSheet|null} The embedded DC20 sheet instance. */
  _charSheet = null;

  /** @type {string|null} Actor id the embedded sheet belongs to. */
  _charActorId = null;

  static DEFAULT_OPTIONS = {
    id: "dc20-mobile-shell",
    tag: "div",
    classes: ["dc20-mobile"],
    window: {
      frame: false,
      positioned: false,
      title: "DC20 Mobile",
    },
  };

  static PARTS = {
    shell: { template: `modules/${MODULE_ID}/templates/shell.hbs` },
  };

  /** @override */
  async _prepareContext() {
    const selected = getSelectedActor();
    const token = getActorToken(selected);

    const characters = getOwnedCharacters().map((a) => ({
      id: a.id,
      name: a.name,
      selected: a.id === selected?.id,
    }));

    const sceneTokens = getSceneTokens().map((t) => ({
      id: t.id,
      name: t.name || t.actor?.name || "—",
      targeted: isTargeted(t),
      isSelf: !!(token && t.id === token.id),
    }));
    // Put the selected actor's own token first.
    sceneTokens.sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0));

    return {
      navActive: this.activeTab === "navigation",
      charActive: this.activeTab === "character",
      hasCharacters: characters.length > 0,
      characters,
      hasSelectedActor: !!selected,
      selectedName: selected?.name ?? "",
      selectedPortrait: selected?.img || selected?.prototypeToken?.texture?.src || "",
      hasToken: !!token,
      targetPanelOpen: this.targetPanelOpen,
      sceneTokens,
      targetCount: game.user.targets.size,
      altSheetAvailable: isAltSheetAvailable(),
      altSheetModuleId: ALT_SHEET_MODULE_ID,
    };
  }

  /** @override */
  _onRender(context, options) {
    const root = this.element;

    root.querySelectorAll(".dc20-tabbtn").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.action === "settings") this._openSettings();
        else this._setTab(btn.dataset.tab);
      })
    );

    root.querySelectorAll(".dc20-dpad-btn").forEach((btn) =>
      btn.addEventListener("click", () =>
        this._onMove(Number(btn.dataset.dx), Number(btn.dataset.dy))
      )
    );

    const select = root.querySelector(".dc20-actor-select");
    if (select) select.addEventListener("change", (ev) => this._onSwitchActor(ev.target.value));

    const targetToggle = root.querySelector(".dc20-target-toggle");
    if (targetToggle) {
      targetToggle.addEventListener("click", () => {
        this.targetPanelOpen = !this.targetPanelOpen;
        this.render();
      });
    }

    root.querySelectorAll(".dc20-target-item").forEach((btn) =>
      btn.addEventListener("click", () => this._onToggleTarget(btn.dataset.tokenId))
    );

    // Reflect the active tab on <body> so CSS can show/hide the mounted sheet.
    document.body.classList.toggle("dc20-tab-character", this.activeTab === "character");
    document.body.classList.toggle("dc20-tab-navigation", this.activeTab !== "character");

    // Mount the alt sheet lazily the first time the Character tab is shown, then
    // leave it mounted — visibility is CSS-driven, so returning is instant and
    // never re-opens (which previously flashed the screen black). It still
    // re-mounts here if the selected actor changed and the old sheet was torn down.
    if (this.activeTab === "character" || this._charSheet) this._mountCharacter();
  }

  /**
   * Open Foundry's Game Settings window. It's rendered as a normal popup, so the
   * `renderApplicationV2` hook tags it `.dc20-mobile-popup` and the CSS centers
   * and sizes it to the viewport. Re-rendering brings an already-open one to the
   * front rather than spawning a duplicate.
   */
  _openSettings() {
    game.settings.sheet.render(true);
  }

  /** Switch the visible tab and re-render. */
  _setTab(tab) {
    if (!tab || tab === this.activeTab) return;
    this.activeTab = tab;
    this.render();
  }

  /** Move the selected actor's token one grid space. */
  async _onMove(dx, dy) {
    const token = getActorToken(getSelectedActor());
    if (!token) return;
    await stepToken(token, dx, dy);
  }

  /** Change the selected character, refreshing the embedded sheet. */
  _onSwitchActor(id) {
    setSelectedActor(id);
    if (this._charSheet && this._charActorId !== id) this._teardownCharacter();
    this.render();
  }

  /** Toggle targeting for a token, then refresh the list highlight. */
  _onToggleTarget(tokenId) {
    const token = canvas.tokens?.get(tokenId);
    toggleTarget(token);
    this.render();
  }

  /**
   * Ensure the selected actor's alt sheet is rendered once and kept mounted.
   * Visibility is governed by the body tab-class, so this neither re-opens nor
   * re-positions the sheet on subsequent calls — it only (re)renders when the
   * selected actor changes or the sheet was closed. No-op if the alt-sheet
   * module isn't enabled (the Character tab shows an "enable me" notice instead).
   */
  async _mountCharacter() {
    if (!isAltSheetAvailable()) {
      this._teardownCharacter();
      return;
    }

    const actor = getSelectedActor();
    if (!actor) {
      this._teardownCharacter();
      return;
    }

    if (this._charSheet && this._charActorId !== actor.id) this._teardownCharacter();

    if (!this._charSheet) {
      const SheetClass = getAltSheetClass();
      if (!SheetClass) return;
      this._charSheet = new SheetClass({ document: actor });
      this._charActorId = actor.id;
    }

    if (!this._charSheet.rendered) {
      await this._charSheet.render({ force: true });
    }
  }

  /** Close and forget the alt sheet. */
  _teardownCharacter() {
    try {
      this._charSheet?.close();
    } catch (err) {
      console.warn("dc20-mobile | failed to close character sheet", err);
    }
    this._charSheet = null;
    this._charActorId = null;
  }

  /** @override */
  async close(options) {
    this._teardownCharacter();
    document.body.classList.remove("dc20-tab-character", "dc20-tab-navigation");
    return super.close(options);
  }
}
