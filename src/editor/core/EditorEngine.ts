/**
 * EditorEngine
 *
 * The central controller of the editor. It owns:
 *   - the current EditorState (immutable)
 *   - the plugin registry
 *   - the subscriber list (React re-renders listen here)
 *
 * The engine is framework-agnostic. React hooks wrap it for component use.
 * This means the same engine could power a terminal editor, a native app, etc.
 *
 * Data flow:
 *   User action → Command → Transaction → dispatch() → applyTransaction()
 *     → new EditorState → notify subscribers → React re-render → DOM update
 *
 * The DOM is NEVER the source of truth. It is always derived from EditorState.
 */

import type {
  EditorState,
  Transaction,
  EditorPlugin,
  EditorEngineInterface,
  StateListener,
} from '../../types';

import { applyTransaction, createTransaction } from './Transaction';
import { createEmptyDocument } from './DocumentModel';

export class EditorEngine implements EditorEngineInterface {
  private state: EditorState;
  private plugins: EditorPlugin[] = [];
  private listeners: Set<StateListener> = new Set();

  constructor(initialState?: Partial<EditorState>) {
    this.state = {
      doc: initialState?.doc ?? createEmptyDocument(),
      selection: initialState?.selection ?? null,
      marks: initialState?.marks ?? [],
      version: 0,
    };
  }

  // ─── State Access ───────────────────────────────────────────────────────────

  getState(): EditorState {
    return this.state;
  }

  // ─── Dispatch ───────────────────────────────────────────────────────────────

  /**
   * The single entry point for all state changes.
   *
   * 1. Let plugins intercept and transform the transaction.
   * 2. Apply the (possibly modified) transaction to produce a new state.
   * 3. Notify all subscribers.
   *
   * Transactions are synchronous. Never dispatch inside a plugin's onTransaction
   * handler (it would cause re-entrancy). Use setTimeout if you need deferred
   * dispatch (rare).
   */
  dispatch(tr: Transaction): void {
    // Plugin interception phase
    let intercepted = tr;
    for (const plugin of this.plugins) {
      if (plugin.onTransaction) {
        intercepted = plugin.onTransaction(intercepted, this.state);
      }
    }

    const prevState = this.state;
    this.state = applyTransaction(this.state, intercepted);

    // Notify plugins of state change
    for (const plugin of this.plugins) {
      if (plugin.onStateChange) {
        plugin.onStateChange(this.state, prevState);
      }
    }

    // Notify React subscribers
    for (const listener of this.listeners) {
      listener(this.state, prevState);
    }
  }

  // ─── Plugin Registry ────────────────────────────────────────────────────────

  registerPlugin(plugin: EditorPlugin): void {
    if (this.plugins.some((p) => p.name === plugin.name)) {
      console.warn(`[EditorEngine] Plugin "${plugin.name}" is already registered.`);
      return;
    }
    this.plugins.push(plugin);
    if (plugin.init) {
      plugin.init(this);
    }
  }

  getPlugin<T extends EditorPlugin>(name: string): T | undefined {
    return this.plugins.find((p) => p.name === name) as T | undefined;
  }

  getPlugins(): EditorPlugin[] {
    return [...this.plugins];
  }

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   * This is what React hooks use to trigger re-renders.
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Keyboard Dispatch ──────────────────────────────────────────────────────

  /**
   * Handle a keyboard event. Plugins register key bindings; the engine
   * tries them in registration order and stops at the first that returns true.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    const key = buildKeyString(event);

    for (const plugin of this.plugins) {
      if (plugin.keyBindings && plugin.keyBindings[key]) {
        const handled = plugin.keyBindings[key](this);
        if (handled) {
          event.preventDefault();
          return true;
        }
      }
    }
    return false;
  }

  // ─── Convenience ────────────────────────────────────────────────────────────

  /**
   * Create a new transaction. Commands call this before adding steps.
   */
  createTransaction(meta?: Record<string, unknown>): Transaction {
    return createTransaction(meta);
  }
}

/**
 * Build a canonical key string from a KeyboardEvent.
 * Examples: 'Ctrl+b', 'Shift+Alt+ArrowDown', 'Enter'
 */
function buildKeyString(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.key);
  return parts.join('+');
}

// ─── Singleton factory ────────────────────────────────────────────────────────

/**
 * Create a new EditorEngine instance.
 * Each editor instance on the page gets its own engine.
 */
export function createEditorEngine(initialState?: Partial<EditorState>): EditorEngine {
  return new EditorEngine(initialState);
}
