/**
 * MobileShell — the full-screen, frameless ApplicationV2 that replaces the
 * desktop UI on mobile devices. It hosts two tabs:
 *   - Navigation: character switcher, 8-direction movement D-pad, targeting.
 *   - Character: the actor's DC20 character sheet shown full-screen.
 *
 * For the Character tab we render the actor's existing sheet via the normal
 * Foundry window pipeline and then CSS-force it to fill the viewport. The tab
 * bar is position:fixed at z-index 10001, above the sheet's z-index 5000.
 */

import { MODULE_ID } from "../const.mjs";
import { getOwnedCharacters, getSelectedActor, setSelectedActor } from "../state.mjs";
import { getActorToken, stepToken } from "../movement.mjs";
import { getSceneTokens, isTargeted, toggleTarget } from "../targeting.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
    }));

    return {
      navActive: this.activeTab === "navigation",
      charActive: this.activeTab === "character",
      hasCharacters: characters.length > 0,
      characters,
      hasSelectedActor: !!selected,
      hasToken: !!token,
      targetPanelOpen: this.targetPanelOpen,
      sceneTokens,
      targetCount: game.user.targets.size,
    };
  }

  /** @override */
  _onRender(context, options) {
    const root = this.element;

    root.querySelectorAll(".dc20-tabbtn").forEach((btn) =>
      btn.addEventListener("click", () => this._setTab(btn.dataset.tab))
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

    if (this.activeTab === "character") this._mountCharacter();
  }

  /** Switch the visible tab and re-render. */
  _setTab(tab) {
    if (!tab || tab === this.activeTab) return;
    if (this.activeTab === "character") this._unmountCharacter();
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
   * Render the selected actor's DC20 sheet (if needed) and make it fullscreen
   * via CSS. The sheet lives in Foundry's normal window layer — we just override
   * its position/size rather than re-parenting its element.
   */
  async _mountCharacter() {
    const actor = getSelectedActor();
    if (!actor) {
      this._teardownCharacter();
      return;
    }

    if (this._charSheet && this._charActorId !== actor.id) this._teardownCharacter();

    if (!this._charSheet) {
      this._charSheet = actor.sheet;
      this._charActorId = actor.id;
    }

    if (!this._charSheet.rendered) {
      await this._charSheet.render(true);
    }

    const el = this._sheetElement();
    if (el) {
      el.classList.remove("dc20-sheet-hidden");
      el.classList.add("dc20-sheet-fullscreen");
    }
  }

  /** Hide the sheet without closing it so state is preserved on return. */
  _unmountCharacter() {
    const el = this._sheetElement();
    if (el) {
      el.classList.remove("dc20-sheet-fullscreen");
      el.classList.add("dc20-sheet-hidden");
    }
  }

  /** The raw DOM element of the character sheet (handles AppV1 jQuery + AppV2). */
  _sheetElement() {
    const raw = this._charSheet?.element;
    if (!raw) return null;
    if (raw instanceof HTMLElement) return raw;
    return raw[0] ?? null;
  }

  /** Close and forget the character sheet. */
  _teardownCharacter() {
    try {
      const el = this._sheetElement();
      if (el) el.classList.remove("dc20-sheet-fullscreen", "dc20-sheet-hidden");
      this._charSheet?.close();
    } catch (err) {
      console.warn("dc20-mobile | failed to close embedded sheet", err);
    }
    this._charSheet = null;
    this._charActorId = null;
  }

  /** @override */
  async close(options) {
    this._teardownCharacter();
    return super.close(options);
  }
}
