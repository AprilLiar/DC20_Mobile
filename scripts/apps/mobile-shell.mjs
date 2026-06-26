/**
 * MobileShell — the full-screen, frameless ApplicationV2 that replaces the
 * desktop UI on mobile devices. It hosts two tabs:
 *   - Navigation: character switcher, 8-direction movement D-pad, targeting.
 *   - Character: the actor's existing DC20 character sheet, embedded full-screen.
 *
 * The DC20 sheet is a legacy AppV1 ActorSheet. We render its own instance and
 * re-parent its element into our Character tab, stripping the window chrome via
 * CSS. The sheet instance is kept on this app and re-attached after each render.
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

    // Keep the embedded character sheet attached across re-renders.
    if (this.activeTab === "character") this._mountCharacter();
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
   * Ensure the selected actor's DC20 sheet is rendered and embedded into the
   * Character tab host element.
   */
  async _mountCharacter() {
    const host = this.element.querySelector(".dc20-character-host");
    if (!host) return;

    const actor = getSelectedActor();
    if (!actor) {
      this._teardownCharacter();
      return;
    }

    if (this._charSheet && this._charActorId !== actor.id) this._teardownCharacter();

    if (!this._charSheet) {
      this._charSheet = actor.sheet;
      this._charActorId = actor.id;
      await this._charSheet._render(true);
    }

    const el = this._sheetElement();
    if (el) {
      el.classList.add("dc20-embedded");
      if (el.parentElement !== host) host.replaceChildren(el);
    }
  }

  /** The raw DOM element of the embedded sheet (AppV1 uses jQuery). */
  _sheetElement() {
    const raw = this._charSheet?.element;
    if (!raw) return null;
    return raw[0] ?? raw;
  }

  /** Close and forget the embedded sheet. */
  _teardownCharacter() {
    try {
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
