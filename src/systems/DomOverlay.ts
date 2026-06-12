import Phaser from 'phaser';
import { gameEvents, type EventArgs, type GameEventMap } from './events';

// Shared lifecycle for every HTML overlay that lives in a persistent
// #*-root element next to the Phaser canvas (quiz, skill picker,
// sentence gate, city panel, unlock-task overlays). Each overlay used
// to hand-roll the same mount/teardown choreography, and a single
// missed `off()` in one copy was enough to leave stale listeners on
// the global bus across scene restarts and double-fire events (the
// double-XP bug). The base class makes that impossible: everything
// registered through the helpers below is recorded and unregistered
// automatically on scene SHUTDOWN, and the root's innerHTML + visible
// class are reset both on mount() and on shutdown so leftover overlay
// DOM can't leak into (or eat clicks in) whichever scene comes next.
export abstract class DomOverlay {
  protected root?: HTMLElement;
  // Teardown callbacks accumulated by the registration helpers; the
  // SHUTDOWN cleanup runs them in registration order.
  private disposers: Array<() => void> = [];
  // The active window-level keydown handler, if any. Tracked outside
  // `disposers` because show/hide attach and detach it repeatedly
  // during the overlay's life, not just at shutdown.
  private windowKeydown?: (ev: KeyboardEvent) => void;

  constructor(
    protected readonly scene: Phaser.Scene,
    private readonly rootId: string,
    private readonly visibleClass: string,
  ) {}

  mount() {
    const root = document.getElementById(this.rootId);
    if (!root) return;
    this.root = root;
    // Reset whatever a previous scene left behind — roots are static
    // DOM nodes in index.html that outlive every scene restart.
    root.innerHTML = '';
    root.classList.remove(this.visibleClass);

    this.onMount(root);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const dispose of this.disposers) dispose();
      this.disposers = [];
      this.detachWindowKeydown();
      // Use this.root (not the captured `root`): subclasses may have
      // re-acquired a replacement node via ensureRoot() since mount().
      if (this.root) {
        this.root.innerHTML = '';
        this.root.classList.remove(this.visibleClass);
      }
    });
  }

  // Subclasses build their initial DOM / register listeners here. Only
  // called when the root element exists; `this.root` is already set.
  protected abstract onMount(root: HTMLElement): void;

  // ── tracked registration helpers ──
  // Everything registered here is unregistered automatically on scene
  // SHUTDOWN, so a subclass can't forget the cleanup half.

  protected onGameEvent<K extends keyof GameEventMap>(
    event: K,
    fn: (...args: EventArgs<K>) => void,
    context?: unknown,
  ) {
    const bus = gameEvents(this.scene.game);
    bus.on(event, fn, context);
    this.disposers.push(() => bus.off(event, fn, context));
  }

  // Listener on the persistent root element itself. (Listeners on
  // children created via innerHTML die with the markup and don't need
  // tracking — this is only for the root node, which survives.)
  protected addRootListener(type: string, handler: EventListener) {
    const root = this.root;
    if (!root) return;
    root.addEventListener(type, handler);
    this.disposers.push(() => root.removeEventListener(type, handler));
  }

  // Escape hatch for shutdown work that isn't a plain listener (e.g.
  // cancelling an in-flight TTS utterance or a progress subscription).
  protected addDisposer(fn: () => void) {
    this.disposers.push(fn);
  }

  // Window-level keydown for the overlay's hotkeys. Replaces any
  // previous handler so repeated show() calls can't stack duplicates;
  // detached by hideRoot() and again (idempotently) on shutdown.
  protected attachWindowKeydown(handler: (ev: KeyboardEvent) => void) {
    this.detachWindowKeydown();
    this.windowKeydown = handler;
    window.addEventListener('keydown', handler);
  }

  protected detachWindowKeydown() {
    if (!this.windowKeydown) return;
    window.removeEventListener('keydown', this.windowKeydown);
    this.windowKeydown = undefined;
  }

  // ── root helpers ──

  // Re-acquire the root by id if the node captured at mount() has been
  // detached (scene transitions can replace the canvas's siblings).
  // Returns the live root, or undefined when it's gone entirely.
  protected ensureRoot(): HTMLElement | undefined {
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById(this.rootId) ?? undefined;
    }
    return this.root;
  }

  protected showRoot() {
    this.root?.classList.add(this.visibleClass);
  }

  // Hide convention shared by every overlay: drop the visible class,
  // blank the markup, release the keyboard.
  protected hideRoot() {
    if (!this.root) return;
    this.root.classList.remove(this.visibleClass);
    this.root.innerHTML = '';
    this.detachWindowKeydown();
  }
}
