/**
 * Transaction Engine
 *
 * A Transaction is a list of Steps applied atomically to produce a new
 * EditorState. This is the ONLY way state changes — never mutate state directly.
 *
 * Architecture (ProseMirror-inspired):
 *   dispatch(transaction) → apply steps → new EditorState → notify listeners
 *
 * Why transactions?
 *   1. Undo/redo: store the inverse transaction, replay to undo.
 *   2. Plugins: intercept and modify transactions before apply.
 *   3. Collaboration: merge remote transactions via OT/CRDT.
 *   4. Debugging: log every change as a serializable step list.
 */

import type {
  EditorState,
  Transaction,
  Step,
  Document,
  EditorSelection,
  Mark,
} from '../../types';

import {
  insertTextAtPath,
  deleteTextAtPath,
  insertNodeAtPath,
  removeNodeAtPath,
  splitBlock,
  joinBlocks,
  setBlockType,
  setNodeAttrs,
  applyMarkToRange,
  removeMarkFromRange,
  setMarkOnRange,
  deleteRange,
  getNodeAtPath,
} from './DocumentModel';

import type { TextNode, NodePosition } from '../../types';

// ─── Transaction Builder ──────────────────────────────────────────────────────

let txCounter = 0;

/**
 * Create a new empty transaction.
 */
export function createTransaction(meta: Record<string, unknown> = {}): Transaction {
  return {
    id: `tx-${++txCounter}-${Date.now()}`,
    steps: [],
    meta,
    timestamp: Date.now(),
  };
}

/**
 * Add a step to an existing transaction (returns a new transaction object).
 */
export function addStep(tr: Transaction, step: Step): Transaction {
  return { ...tr, steps: [...tr.steps, step] };
}

// ─── Apply Transaction ────────────────────────────────────────────────────────

/**
 * Apply a transaction to the current state, producing a new state.
 * This is a pure function: same inputs → same output.
 */
export function applyTransaction(state: EditorState, tr: Transaction): EditorState {
  let doc = state.doc;
  let selection = state.selection;
  let marks = state.marks;

  for (const step of tr.steps) {
    switch (step.type) {
      case 'insert_text':
        doc = insertTextAtPath(doc, step.path, step.offset, step.text, step.marks);
        break;

      case 'delete_text':
        doc = deleteTextAtPath(doc, step.path, step.from, step.to);
        break;

      case 'delete_range': {
        const result = deleteRange(doc, step.from, step.to);
        doc = result.doc;
        selection = {
          anchor: result.cursor,
          focus: result.cursor,
          isCollapsed: true,
        };
        break;
      }

      case 'insert_node':
        doc = insertNodeAtPath(doc, step.parentPath, step.index, step.node);
        break;

      case 'delete_node':
        doc = removeNodeAtPath(doc, step.path);
        break;

      case 'split_block':
        doc = splitBlock(doc, step.path, step.offset);
        break;

      case 'join_blocks':
        doc = joinBlocks(doc, step.path);
        break;

      case 'set_node_type':
        doc = setBlockType(doc, step.path, step.nodeType, step.attrs);
        break;

      case 'set_node_attrs':
        doc = setNodeAttrs(doc, step.path, step.attrs);
        break;

      case 'add_mark':
        doc = applyMarkToRange(doc, step.from, step.to, step.mark);
        break;

      case 'remove_mark':
        doc = removeMarkFromRange(doc, step.from, step.to, step.markType);
        break;

      case 'set_mark':
        doc = setMarkOnRange(doc, step.from, step.to, step.markType, step.mark);
        break;

      case 'set_selection':
        selection = step.selection;
        // When cursor moves to a collapsed position, inherit marks from the
        // text node at the cursor so toolbar state reflects the context.
        if (selection && selection.isCollapsed) {
          const node = getNodeAtPath(doc, selection.anchor.path);
          if (node && node.type === 'text') {
            marks = (node as TextNode).marks;
          }
        }
        break;

      case 'replace_doc':
        doc = step.doc;
        selection = null;
        break;

      default:
        console.warn('[EditorEngine] Unknown step type:', (step as Step).type);
    }
  }

  // Merge pending marks from the transaction if provided
  if (tr.meta.pendingMarks !== undefined) {
    marks = tr.meta.pendingMarks as Mark[];
  }

  return {
    doc,
    selection,
    marks,
    version: state.version + 1,
  };
}

// ─── Convenience Transaction Builders ─────────────────────────────────────────
// These are helpers used by commands so commands don't need to know step shapes.

export function tr_insertText(
  path: number[],
  offset: number,
  text: string,
  marks: Mark[],
): Step {
  return { type: 'insert_text', path, offset, text, marks };
}

export function tr_deleteText(path: number[], from: number, to: number): Step {
  return { type: 'delete_text', path, from, to };
}

export function tr_deleteRange(from: NodePosition, to: NodePosition): Step {
  return { type: 'delete_range', from, to };
}

export function tr_splitBlock(path: number[], offset: number): Step {
  return { type: 'split_block', path, offset };
}

export function tr_joinBlocks(path: number[]): Step {
  return { type: 'join_blocks', path };
}

export function tr_setNodeType(
  path: number[],
  nodeType: import('../../types').BlockNodeType,
  attrs?: import('../../types').NodeAttrs,
): Step {
  return { type: 'set_node_type', path, nodeType, attrs };
}

export function tr_addMark(
  from: import('../../types').NodePosition,
  to: import('../../types').NodePosition,
  mark: Mark,
): Step {
  return { type: 'add_mark', from, to, mark };
}

export function tr_removeMark(
  from: import('../../types').NodePosition,
  to: import('../../types').NodePosition,
  markType: import('../../types').MarkType,
): Step {
  return { type: 'remove_mark', from, to, markType };
}

export function tr_setSelection(
  selection: EditorSelection | null,
): Step {
  return { type: 'set_selection', selection };
}

export function tr_replaceDoc(doc: Document): Step {
  return { type: 'replace_doc', doc };
}

export function tr_setNodeAttrs(path: number[], attrs: import('../../types').NodeAttrs): Step {
  return { type: 'set_node_attrs', path, attrs };
}

export function tr_setMark(
  from: import('../../types').NodePosition,
  to: import('../../types').NodePosition,
  markType: import('../../types').MarkType,
  mark: Mark | null,
): Step {
  return { type: 'set_mark', from, to, markType, mark };
}
