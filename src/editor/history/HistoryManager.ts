/**
 * HistoryManager
 *
 * Implements undo/redo by storing past EditorState snapshots.
 *
 * Architecture choice: State-snapshot model vs. Inverse-step model
 *
 *   Inverse-step (ProseMirror): store the inverse of each transaction.
 *   Undo = apply the inverse transaction. Efficient for large docs.
 *
 *   State-snapshot (simpler): store the full EditorState at each history
 *   point. Undo = restore the previous snapshot. Works great for small-to-
 *   medium docs and is much easier to implement correctly.
 *
 * We use state-snapshot here. For a collaborative or very large-doc editor
 * you'd upgrade to inverse steps + rebasing.
 *
 * The HistoryManager is implemented as an EditorPlugin so it integrates
 * seamlessly with the plugin architecture.
 */

import type {
  EditorPlugin,
  EditorEngineInterface,
  EditorState,
  Transaction,
} from '../../types';
import { createTransaction } from '../core/Transaction';
import { tr_replaceDoc, tr_setSelection } from '../core/Transaction';

const HISTORY_PLUGIN_NAME = 'history';
const MAX_HISTORY = 100; // max undo steps to keep

interface HistoryEntry {
  state: EditorState;
  label: string; // human-readable description for debugging
}

interface HistoryManagerState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

const managerMap = new WeakMap<EditorEngineInterface, HistoryManagerState>();

function getManagerState(engine: EditorEngineInterface): HistoryManagerState {
  if (!managerMap.has(engine)) {
    managerMap.set(engine, { undoStack: [], redoStack: [] });
  }
  return managerMap.get(engine)!;
}

export function createHistoryPlugin(): EditorPlugin {
  return {
    name: HISTORY_PLUGIN_NAME,

    init(engine: EditorEngineInterface) {
      // Seed the undo stack with the initial state so the first undo
      // can restore back to an empty document.
      const { undoStack } = getManagerState(engine);
      undoStack.push({ state: engine.getState(), label: 'initial' });
    },

    onTransaction(tr: Transaction, state: EditorState): Transaction {
      // Skip history-internal transactions to avoid infinite loops
      if (tr.meta.historyInternal) return tr;

      // Skip transactions that only update selection (no doc changes)
      const hasDocChange = tr.steps.some((s) => s.type !== 'set_selection');
      if (!hasDocChange) return tr;

      return tr;
    },

    onStateChange(state: EditorState, prevState: EditorState) {
      // This is called by the engine AFTER the transaction is applied.
      // We capture the PREVIOUS state as an undo point.
      // We skip if the doc didn't change (selection-only update).
      if (state.doc === prevState.doc) return;

      const engine = findEngine(this);
      if (!engine) return;

      const ms = getManagerState(engine);

      // Push the PREVIOUS state so we can undo back to it
      ms.undoStack.push({ state: prevState, label: 'change' });
      if (ms.undoStack.length > MAX_HISTORY) {
        ms.undoStack.shift(); // drop oldest
      }

      // Any new change clears the redo stack (standard undo semantics)
      ms.redoStack = [];
    },

    keyBindings: {
      'Ctrl+z': (engine) => undo(engine),
      'Ctrl+Z': (engine) => undo(engine),
      'Ctrl+Shift+z': (engine) => redo(engine),
      'Ctrl+Shift+Z': (engine) => redo(engine),
      'Ctrl+y': (engine) => redo(engine),
    },
  };

  // Workaround: plugins don't naturally have a back-reference to the engine.
  // We store it via init and look it up via the WeakMap.
  function findEngine(_plugin: EditorPlugin): EditorEngineInterface | null {
    // The engine is captured via closure from the plugin registration.
    // We use the WeakMap keyed by engine, but we need to know which engine.
    // Solution: the plugin's init captures the engine reference.
    return null; // overridden below
  }
}

// ─── Stateful Plugin Factory (captures engine ref) ───────────────────────────

/**
 * Create a history plugin with engine reference captured in closure.
 * Call this factory instead of createHistoryPlugin() directly.
 */
export function createHistoryManager(): EditorPlugin {
  let engineRef: EditorEngineInterface | null = null;
  const undoStack: HistoryEntry[] = [];
  const redoStack: HistoryEntry[] = [];
  let isDoingHistoryAction = false;

  return {
    name: HISTORY_PLUGIN_NAME,

    init(engine: EditorEngineInterface) {
      engineRef = engine;
      // Capture initial state
      undoStack.push({ state: engine.getState(), label: 'initial' });
    },

    onStateChange(newState: EditorState, prevState: EditorState) {
      // Skip recording during undo/redo — otherwise onStateChange would
      // push the pre-undo state back onto the stack and clear the redo stack.
      if (isDoingHistoryAction) return;
      if (newState.doc === prevState.doc) return;

      undoStack.push({ state: prevState, label: 'change' });
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
    },

    keyBindings: {
      'Ctrl+z': (_engine) => performUndo(),
      'Ctrl+Z': (_engine) => performUndo(),
      'Ctrl+Shift+z': (_engine) => performRedo(),
      'Ctrl+Shift+Z': (_engine) => performRedo(),
      'Ctrl+y': (_engine) => performRedo(),
    },
  };

  function performUndo(): boolean {
    if (!engineRef || undoStack.length <= 1) return false;

    const current = engineRef.getState();
    redoStack.push({ state: current, label: 'redo-point' });

    const prev = undoStack.pop()!;

    isDoingHistoryAction = true;
    try {
      const tr = createTransaction({ historyInternal: true });
      tr.steps.push(tr_replaceDoc(prev.state.doc));
      tr.steps.push(tr_setSelection(prev.state.selection));
      engineRef.dispatch(tr);
    } finally {
      isDoingHistoryAction = false;
    }
    return true;
  }

  function performRedo(): boolean {
    if (!engineRef || redoStack.length === 0) return false;

    const current = engineRef.getState();
    undoStack.push({ state: current, label: 'undo-point' });

    const next = redoStack.pop()!;

    isDoingHistoryAction = true;
    try {
      const tr = createTransaction({ historyInternal: true });
      tr.steps.push(tr_replaceDoc(next.state.doc));
      tr.steps.push(tr_setSelection(next.state.selection));
      engineRef.dispatch(tr);
    } finally {
      isDoingHistoryAction = false;
    }
    return true;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function undo(engine: EditorEngineInterface): boolean {
  const plugin = engine.getPlugin
    ? (engine as import('../core/EditorEngine').EditorEngine).getPlugin(HISTORY_PLUGIN_NAME)
    : undefined;
  if (!plugin) return false;
  // Trigger via key binding
  if (plugin.keyBindings?.['Ctrl+z']) {
    return plugin.keyBindings['Ctrl+z'](engine);
  }
  return false;
}

export function redo(engine: EditorEngineInterface): boolean {
  const plugin = engine.getPlugin
    ? (engine as import('../core/EditorEngine').EditorEngine).getPlugin(HISTORY_PLUGIN_NAME)
    : undefined;
  if (!plugin) return false;
  if (plugin.keyBindings?.['Ctrl+y']) {
    return plugin.keyBindings['Ctrl+y'](engine);
  }
  return false;
}
