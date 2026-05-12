/**
 * SearchCommands
 *
 * Commands for replacing text matches found by SearchEngine.
 * Processes replacements last-to-first within each text node so that
 * earlier offsets remain valid after each delete/insert pair.
 */

import type { Command, TextNode, EditorNode } from '../../types';
import { createTransaction, tr_setSelection } from '../core/Transaction';
import { getNodeAtPath } from '../core/DocumentModel';
import { makePosition, makeCollapsedSelection } from '../selection/SelectionEngine';
import type { SearchMatch } from './SearchEngine';

// ─── Replace Single Match ─────────────────────────────────────────────────────

export function replaceMatch(match: SearchMatch, replacement: string): Command {
  return (engine) => {
    const state = engine.getState();
    const node = getNodeAtPath(state.doc, match.path) as EditorNode | null;
    if (!node || node.type !== 'text') return false;

    const textNode = node as TextNode;
    const marks = textNode.marks;
    const tr = createTransaction();

    // When the match spans the entire text node, deleteTextAtPath removes the
    // node entirely (newText === '').  A subsequent insert_text at the same
    // path would find nothing and silently drop the replacement.  Use
    // insert_node at the parent block's index instead so the replacement lands
    // at exactly the right position regardless of sibling count.
    const wholeNode =
      match.startOffset === 0 && match.endOffset === textNode.text.length;

    tr.steps.push({ type: 'delete_text', path: match.path, from: match.startOffset, to: match.endOffset });

    if (replacement) {
      if (wholeNode) {
        tr.steps.push({
          type: 'insert_node',
          parentPath: match.path.slice(0, -1),
          index: match.path[match.path.length - 1],
          node: { type: 'text', text: replacement, marks } as TextNode,
        });
      } else {
        tr.steps.push({ type: 'insert_text', path: match.path, offset: match.startOffset, text: replacement, marks });
      }
    }

    tr.steps.push(tr_setSelection(
      makeCollapsedSelection(makePosition(match.path, match.startOffset + replacement.length)),
    ));

    engine.dispatch(tr);
    return true;
  };
}

// ─── Replace All Matches ──────────────────────────────────────────────────────

export function replaceAllMatches(matches: SearchMatch[], replacement: string): Command {
  return (engine) => {
    if (matches.length === 0) return false;

    const state = engine.getState();
    const tr = createTransaction();

    // Reverse so we process last-to-first — earlier offsets stay valid
    // even after each delete/insert modifies the text node length.
    const reversed = [...matches].reverse();

    for (const match of reversed) {
      const node = getNodeAtPath(state.doc, match.path) as EditorNode | null;
      if (!node || node.type !== 'text') continue;

      const textNode = node as TextNode;
      const marks = textNode.marks;
      const wholeNode =
        match.startOffset === 0 && match.endOffset === textNode.text.length;

      tr.steps.push({ type: 'delete_text', path: match.path, from: match.startOffset, to: match.endOffset });

      if (replacement) {
        if (wholeNode) {
          tr.steps.push({
            type: 'insert_node',
            parentPath: match.path.slice(0, -1),
            index: match.path[match.path.length - 1],
            node: { type: 'text', text: replacement, marks } as TextNode,
          });
        } else {
          tr.steps.push({ type: 'insert_text', path: match.path, offset: match.startOffset, text: replacement, marks });
        }
      }
    }

    engine.dispatch(tr);
    return true;
  };
}
