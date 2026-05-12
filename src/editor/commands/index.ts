/**
 * Editor Commands
 *
 * A Command is a pure function: (engine) → boolean.
 * It creates a Transaction, adds steps, and dispatches it.
 * Returns true if it handled the action (for key binding chains).
 *
 * Commands are the ONLY place that should call engine.dispatch().
 * Components and plugins should call commands, not dispatch directly.
 *
 * Architecture note:
 *   Commands don't know about React or the DOM.
 *   They only know about EditorState and Transactions.
 *   This makes them trivially testable.
 */

import type {
  Command,
  Mark,
  MarkType,
  BlockNodeType,
  EditorNode,
  TextNode,
  BlockNode,
  NodeAttrs,
  EditorEngineInterface,
} from '../../types';

import {
  createTransaction,
  tr_addMark,
  tr_removeMark,
  tr_setMark,
  tr_setNodeType,
  tr_setNodeAttrs,
  tr_splitBlock,
  tr_joinBlocks,
  tr_insertText,
  tr_setSelection,
  tr_deleteRange,
} from '../core/Transaction';

import {
  isTextNode,
  findContentBlockPath,
  normalizeRange,
  getNodeAtPath,
  createParagraph,
  marksEqual,
} from '../core/DocumentModel';

import {
  getActiveMarks,
  getActiveLinkRange,
  makePosition,
  makeCollapsedSelection,
} from '../selection/SelectionEngine';

// ─── Mark Commands ────────────────────────────────────────────────────────────

/**
 * Toggle a mark on the current selection.
 * If the selection has the mark → remove it.
 * If not → add it.
 */
export function toggleMark(markType: MarkType, attrs?: Record<string, unknown>): Command {
  return (engine) => {
    const state = engine.getState();
    const { doc } = state;
    const selection = state.selection ?? makeCollapsedSelection(makePosition([0], 0));

    const mark: Mark = { type: markType, attrs: attrs as Mark['attrs'] };

    const tr = createTransaction();
    if (!state.selection) tr.steps.push(tr_setSelection(selection));

    if (selection.isCollapsed) {
      // Collapsed cursor: toggle against pending marks (state.marks), NOT the
      // text node at cursor. getActiveMarks reads the text node which never
      // reflects pending marks set before typing — using it here caused the
      // mark to keep accumulating instead of toggling off.
      const isPendingActive = state.marks.some((m) => m.type === markType);
      tr.meta.pendingMarks = isPendingActive
        ? state.marks.filter((m) => m.type !== markType)
        : [...state.marks, mark];
      engine.dispatch(tr);
      return true;
    }

    const activeMarks = getActiveMarks(doc, selection);
    const isActive = activeMarks.has(markType);

    const from = selection.anchor;
    const to = selection.focus;

    if (isActive) {
      tr.steps.push(tr_removeMark(from, to, markType));
    } else {
      tr.steps.push(tr_addMark(from, to, mark));
    }

    engine.dispatch(tr);
    return true;
  };
}

export const toggleBold: Command = toggleMark('bold');
export const toggleItalic: Command = toggleMark('italic');
export const toggleUnderline: Command = toggleMark('underline');
export const toggleStrikethrough: Command = toggleMark('strikethrough');
export const toggleCode: Command = toggleMark('code');

// ─── Block Type Commands ──────────────────────────────────────────────────────

/**
 * Set the block type of the paragraph containing the cursor.
 * If the block is already the target type, revert to paragraph.
 */
export function setBlockType(nodeType: BlockNodeType, attrs: NodeAttrs = {}): Command {
  return (engine) => {
    const state = engine.getState();
    const { doc } = state;
    const selection = state.selection ?? makeCollapsedSelection(makePosition([0], 0));

    const blockPath = findContentBlockPath(doc, selection.anchor.path);
    if (!blockPath) return false;

    const currentBlock = getNodeAtPath(doc, blockPath) as import('../../types').BlockNode | null;
    const currentType = currentBlock?.type ?? 'paragraph';

    // For headings compare both type and level so H1→H2 changes level rather than toggling off
    const isSame = currentType === nodeType &&
      (nodeType !== 'heading' || (currentBlock?.attrs?.level ?? 1) === (attrs.level ?? 1));

    const targetType = isSame ? 'paragraph' : nodeType;
    const targetAttrs = isSame ? {} : attrs;

    const tr = createTransaction();
    tr.steps.push(tr_setNodeType(blockPath, targetType, targetAttrs));
    if (!state.selection) tr.steps.push(tr_setSelection(selection));
    engine.dispatch(tr);
    return true;
  };
}

export const setHeading = (level: 1 | 2 | 3 | 4 | 5 | 6): Command =>
  setBlockType('heading', { level });

export const setParagraph: Command = setBlockType('paragraph');
export const setBlockquote: Command = setBlockType('blockquote');
export const setCodeBlock: Command = setBlockType('code_block');

/**
 * Toggle bullet list. Wraps the current block in a bullet_list > list_item,
 * or unwraps it back to a paragraph if already inside a list.
 */
const toggleListOfType = (listType: 'bullet_list' | 'ordered_list'): Command => (engine) => {
  const state = engine.getState();
  const { doc } = state;
  const selection = state.selection ?? makeCollapsedSelection(makePosition([0], 0));

  const blockPath = findContentBlockPath(doc, selection.anchor.path);
  if (!blockPath) return false;

  const block = getNodeAtPath(doc, blockPath) as BlockNode | null;
  if (!block) return false;

  const parentPath = blockPath.slice(0, -1);
  const parent = getNodeAtPath(doc, parentPath) as BlockNode | import('../../types').Document | null;
  const parentType = (parent && 'type' in parent) ? parent.type : 'doc';

  const blockIdx = blockPath[blockPath.length - 1];
  const tr = createTransaction();

  // Already inside a list of the target kind → unwrap back to a paragraph.
  if (block.type === 'list_item' && parentType === listType) {
    // Replace the list with the list_item's children as paragraphs at the list's position.
    const listPath = parentPath;
    const grandParentPath = listPath.slice(0, -1);
    const listIdx = listPath[listPath.length - 1];

    // Convert this list_item's content into a paragraph node.
    const paragraph: BlockNode = {
      type: 'paragraph',
      attrs: {},
      children: block.children,
    };

    // Build new list with this item removed (keep siblings).
    const listNode = parent as BlockNode;
    const remainingItems = listNode.children.filter((_, i) => i !== blockIdx);

    tr.steps.push({ type: 'delete_node', path: listPath });
    let insertIdx = listIdx;
    if (remainingItems.length > 0) {
      // Re-insert the list (without this item) at the same spot.
      tr.steps.push({
        type: 'insert_node',
        parentPath: grandParentPath,
        index: listIdx,
        node: { ...listNode, children: remainingItems },
      });
      insertIdx = listIdx + 1;
    }
    tr.steps.push({
      type: 'insert_node',
      parentPath: grandParentPath,
      index: insertIdx,
      node: paragraph,
    });
    engine.dispatch(tr);
    return true;
  }

  // Wrap the current block in a list. Preserve its inline children as a list_item.
  const listItem: BlockNode = {
    type: 'list_item',
    attrs: {},
    children: block.children,
  };
  const listNode: BlockNode = {
    type: listType,
    attrs: {},
    children: [listItem],
  };

  tr.steps.push({ type: 'delete_node', path: blockPath });
  tr.steps.push({
    type: 'insert_node',
    parentPath,
    index: blockIdx,
    node: listNode,
  });
  // Move the cursor into the new list_item's first text node.
  tr.steps.push(
    tr_setSelection(
      makeCollapsedSelection(makePosition([...blockPath, 0, 0], 0)),
    ),
  );
  engine.dispatch(tr);
  return true;
};

export const toggleBulletList: Command = toggleListOfType('bullet_list');
export const toggleOrderedList: Command = toggleListOfType('ordered_list');

// ─── Check List ───────────────────────────────────────────────────────────────

/**
 * Exit an empty check_list_item: extract it as a paragraph, splitting the
 * surrounding check_list into before/after parts as needed.
 */
function exitCheckListItem(
  engine: EditorEngineInterface,
  doc: import('../../types').Document,
  blockPath: number[],
): boolean {
  const parentPath = blockPath.slice(0, -1);
  const parent = getNodeAtPath(doc, parentPath) as BlockNode | null;
  if (!parent || parent.type !== 'check_list') return false;

  const blockIdx   = blockPath[blockPath.length - 1];
  const listIdx    = parentPath[parentPath.length - 1];
  const grandPath  = parentPath.slice(0, -1);

  const before = (parent.children as BlockNode[]).slice(0, blockIdx);
  const after  = (parent.children as BlockNode[]).slice(blockIdx + 1);

  const tr = createTransaction();

  // Remove the whole list then re-assemble around an empty paragraph.
  tr.steps.push({ type: 'delete_node', path: parentPath });

  let insertAt = listIdx;
  if (before.length > 0) {
    tr.steps.push({ type: 'insert_node', parentPath: grandPath, index: insertAt, node: { ...parent, children: before } as BlockNode });
    insertAt++;
  }

  const para = createParagraph();
  tr.steps.push({ type: 'insert_node', parentPath: grandPath, index: insertAt, node: para });
  const paraPath = [...grandPath, insertAt];
  insertAt++;

  if (after.length > 0) {
    tr.steps.push({ type: 'insert_node', parentPath: grandPath, index: insertAt, node: { ...parent, children: after } as BlockNode });
  }

  tr.steps.push(tr_setSelection(makeCollapsedSelection(makePosition(paraPath, 0))));
  engine.dispatch(tr);
  return true;
}

/**
 * Toggle checklist. Wraps the current block in check_list > check_list_item,
 * or unwraps it back to a paragraph if already inside a checklist.
 */
export const toggleCheckList: Command = (engine) => {
  const state = engine.getState();
  const { doc } = state;
  const selection = state.selection ?? makeCollapsedSelection(makePosition([0], 0));

  const blockPath = findContentBlockPath(doc, selection.anchor.path);
  if (!blockPath) return false;

  const block = getNodeAtPath(doc, blockPath) as BlockNode | null;
  if (!block) return false;

  const parentPath = blockPath.slice(0, -1);
  const parent = getNodeAtPath(doc, parentPath) as BlockNode | import('../../types').Document | null;
  const parentType = (parent && 'type' in parent) ? parent.type : 'doc';
  const blockIdx = blockPath[blockPath.length - 1];
  const tr = createTransaction();

  // Already in a check_list_item → unwrap to paragraph.
  if (block.type === 'check_list_item' && parentType === 'check_list') {
    const listPath = parentPath;
    const grandParentPath = listPath.slice(0, -1);
    const listIdx = listPath[listPath.length - 1];

    const paragraph: BlockNode = { type: 'paragraph', attrs: {}, children: block.children };
    const listNode = parent as BlockNode;
    const remainingItems = listNode.children.filter((_, i) => i !== blockIdx);

    tr.steps.push({ type: 'delete_node', path: listPath });
    let insertIdx = listIdx;
    if (remainingItems.length > 0) {
      tr.steps.push({ type: 'insert_node', parentPath: grandParentPath, index: listIdx, node: { ...listNode, children: remainingItems } });
      insertIdx = listIdx + 1;
    }
    tr.steps.push({ type: 'insert_node', parentPath: grandParentPath, index: insertIdx, node: paragraph });
    engine.dispatch(tr);
    return true;
  }

  // Wrap current block in check_list > check_list_item.
  const checkListItem: BlockNode = { type: 'check_list_item', attrs: { checked: false }, children: block.children };
  const checkListNode: BlockNode = { type: 'check_list', attrs: {}, children: [checkListItem] };

  tr.steps.push({ type: 'delete_node', path: blockPath });
  tr.steps.push({ type: 'insert_node', parentPath, index: blockIdx, node: checkListNode });
  tr.steps.push(tr_setSelection(makeCollapsedSelection(makePosition([...blockPath, 0, 0], 0))));
  engine.dispatch(tr);
  return true;
};

/**
 * Toggle the checked state of the check_list_item at path.
 * Called by the Editor's mousedown handler when the user clicks a checkbox.
 */
export function toggleCheckItemAt(path: number[]): Command {
  return (engine) => {
    const state = engine.getState();
    const node = getNodeAtPath(state.doc, path) as BlockNode | null;
    if (!node || node.type !== 'check_list_item') return false;

    const tr = createTransaction();
    tr.steps.push(tr_setNodeAttrs(path, { checked: !node.attrs?.checked }));
    engine.dispatch(tr);
    return true;
  };
}

// ─── Text Insertion ───────────────────────────────────────────────────────────

/**
 * Insert text at the current cursor position with the current pending marks.
 * If a range is selected, deletes it first (industry-standard "type-to-replace").
 */
export function insertText(text: string): Command {
  return (engine) => {
    const state = engine.getState();
    const { selection, marks, doc } = state;
    if (!selection) return false;

    const tr = createTransaction();
    let insertAt = selection.anchor;

    if (!selection.isCollapsed) {
      const { from } = normalizeRange(selection.anchor, selection.focus);
      tr.steps.push(tr_deleteRange(selection.anchor, selection.focus));
      insertAt = from;
    }

    // Resolve the cursor's text-node path. If the selection points at a block
    // (empty paragraph), the cursor lands at [...blockPath, 0] after insertion.
    const node = getNodeAtPath(doc, insertAt.path);
    const isAtBlock = !node || !isTextNode(node as EditorNode);
    let cursorPath: number[];
    let cursorOffset: number;

    if (isAtBlock) {
      cursorPath = [...insertAt.path, 0];
      cursorOffset = text.length;
    } else {
      const textNode = node as TextNode;
      if (marksEqual(textNode.marks, marks)) {
        // Same marks: text spliced in-place, cursor stays on same node.
        cursorPath = insertAt.path;
        cursorOffset = insertAt.offset + text.length;
      } else {
        // Different marks: insertTextAtPath splits the node. The new text node
        // lands at parentPath[nodeIndex + (hasBefore ? 1 : 0)]. Using the
        // pre-split path here caused set_selection to read the wrong node's
        // marks, resetting state.marks and breaking continued formatting.
        const parentPath = insertAt.path.slice(0, -1);
        const nodeIndex = insertAt.path[insertAt.path.length - 1];
        const hasBefore = insertAt.offset > 0;
        cursorPath = [...parentPath, nodeIndex + (hasBefore ? 1 : 0)];
        cursorOffset = text.length;
      }
    }

    tr.steps.push(tr_insertText(insertAt.path, insertAt.offset, text, marks));
    tr.steps.push(
      tr_setSelection(
        makeCollapsedSelection(makePosition(cursorPath, cursorOffset)),
      ),
    );

    engine.dispatch(tr);
    return true;
  };
}

/**
 * Replace the current selection with the given text. Used by handleBeforeInput
 * to implement "typing replaces selected text".
 */
export const replaceSelectionWithText = (text: string): Command => insertText(text);

// ─── Enter / Backspace ───────────────────────────────────────────────────────

/**
 * Handle Enter key: split the current block at the cursor. If a range is selected,
 * delete the range first.
 */
export const handleEnter: Command = (engine) => {
  const state = engine.getState();
  const { selection, doc } = state;
  if (!selection) return false;

  const tr = createTransaction();

  let cursor = selection.anchor;
  if (!selection.isCollapsed) {
    const { from } = normalizeRange(selection.anchor, selection.focus);
    tr.steps.push(tr_deleteRange(selection.anchor, selection.focus));
    cursor = from;
  }

  const blockPath = findContentBlockPath(doc, cursor.path);
  if (!blockPath) return false;

  // Enter on an empty check_list_item exits the list instead of splitting.
  if (selection.isCollapsed) {
    const blockNode = getNodeAtPath(doc, blockPath) as BlockNode | null;
    if (blockNode?.type === 'check_list_item') {
      const isEmpty = blockNode.children.length === 0 ||
        (blockNode.children as EditorNode[]).every(
          (c) => c.type !== 'text' || (c as TextNode).text.length === 0,
        );
      if (isEmpty) return exitCheckListItem(engine, doc, blockPath);
    }
  }

  // Compute the text offset within the block where the cursor sits.
  // For a text-node path this is the same as the offset within that text node
  // PLUS the sum of preceding sibling text lengths in the block.
  const blockOffset = computeBlockOffset(doc, blockPath, cursor);
  tr.steps.push(tr_splitBlock(blockPath, blockOffset));

  // Cursor lands at the start of the new (second) block.
  const newBlockPath = [...blockPath.slice(0, -1), blockPath[blockPath.length - 1] + 1];
  tr.steps.push(
    tr_setSelection(makeCollapsedSelection(makePosition([...newBlockPath, 0], 0))),
  );

  engine.dispatch(tr);
  return true;
};

/**
 * Handle Backspace: delete a character, or if a range is selected delete the range,
 * or if at the start of a block join with the previous block.
 */
export const handleBackspace: Command = (engine) => {
  const state = engine.getState();
  const { selection, doc } = state;
  if (!selection) return false;

  // Range selected → delete it.
  if (!selection.isCollapsed) {
    const tr = createTransaction();
    tr.steps.push(tr_deleteRange(selection.anchor, selection.focus));
    engine.dispatch(tr);
    return true;
  }

  const { path, offset } = selection.anchor;

  if (offset > 0) {
    const tr = createTransaction();
    tr.steps.push({ type: 'delete_text', path, from: offset - 1, to: offset });
    tr.steps.push(
      tr_setSelection(makeCollapsedSelection(makePosition(path, offset - 1))),
    );
    engine.dispatch(tr);
    return true;
  }

  // At the start of a text node: if there's a previous sibling in the block,
  // move cursor there. Otherwise join with previous block.
  const blockPath = findContentBlockPath(doc, path);
  if (!blockPath) return false;

  // Backspace on an empty check_list_item exits the list.
  const blockNode = getNodeAtPath(doc, blockPath) as BlockNode | null;
  if (blockNode?.type === 'check_list_item') {
    const isEmpty = blockNode.children.length === 0 ||
      (blockNode.children as EditorNode[]).every(
        (c) => c.type !== 'text' || (c as TextNode).text.length === 0,
      );
    if (isEmpty) return exitCheckListItem(engine, doc, blockPath);
  }

  const blockIdx = blockPath[blockPath.length - 1];
  if (blockIdx === 0 && path.length === blockPath.length + 1 && path[blockPath.length] === 0) {
    return true; // first text in first block; nothing to delete
  }

  const tr = createTransaction();
  tr.steps.push(tr_joinBlocks(blockPath));
  engine.dispatch(tr);
  return true;
};

/**
 * Compute the flat text offset of a position within a block.
 * For Enter/split: we need the character offset within the block's flat text.
 */
function computeBlockOffset(
  doc: import('../../types').Document,
  blockPath: number[],
  pos: import('../../types').NodePosition,
): number {
  // Walk the block's children up to pos.path, summing text lengths;
  // add pos.offset for the text node containing the cursor.
  const block = (function get(d: typeof doc, p: number[]): unknown {
    let cur: unknown = d;
    for (const i of p) {
      cur = (cur as { children: unknown[] }).children[i];
    }
    return cur;
  })(doc, blockPath) as import('../../types').BlockNode | null;
  if (!block) return 0;

  let offset = 0;
  const targetIdx = pos.path[blockPath.length];
  if (targetIdx === undefined) return 0;

  for (let i = 0; i < targetIdx; i++) {
    const child = block.children[i];
    if (child && child.type === 'text') {
      offset += (child as TextNode).text.length;
    }
  }
  offset += pos.offset;
  return offset;
}

// ─── Link ─────────────────────────────────────────────────────────────────────

/**
 * Insert or update a link — mirrors CKEditor 5 link behaviour:
 *
 * 1. Cursor collapsed, text provided  → insert a new text node with the link
 *    mark at the cursor position, then place cursor after it.
 * 2. Cursor collapsed inside existing link → update the href on the whole link
 *    span (all adjacent same-href nodes) using tr_setMark to avoid duplicates.
 * 3. Range selected → atomically replace any existing link on that range with
 *    the new href via tr_setMark (also prevents duplicate <a> tags).
 */
export function insertLink(href: string, displayText?: string): Command {
  return (engine) => {
    const state = engine.getState();
    const { selection, doc, marks } = state;
    if (!selection) return false;

    const linkMark: Mark = { type: 'link', attrs: { href } };
    const tr = createTransaction();

    // ── Case 1: collapsed cursor ──────────────────────────────────────────────
    if (selection.isCollapsed) {
      const linkRange = getActiveLinkRange(doc, selection);

      if (linkRange) {
        // Update existing link span href atomically
        tr.steps.push(tr_setMark(linkRange.from, linkRange.to, 'link', linkMark));
        engine.dispatch(tr);
        return true;
      }

      if (displayText && displayText.trim()) {
        // Insert brand-new linked text at cursor
        const text = displayText.trim();
        const insertAt = selection.anchor;
        const node = getNodeAtPath(doc, insertAt.path);
        const isAtBlock = !node || !isTextNode(node as EditorNode);

        // Build marks for the new node: current pending marks + link
        const baseMarks = marks.filter((m) => m.type !== 'link');
        const newMarks: Mark[] = [...baseMarks, linkMark];

        // Calculate cursor position after insertion (same split-aware logic as insertText)
        let cursorPath: number[];
        let cursorOffset: number;
        if (isAtBlock) {
          cursorPath = [...insertAt.path, 0];
          cursorOffset = text.length;
        } else {
          const textNode = node as TextNode;
          if (marksEqual(textNode.marks, newMarks)) {
            cursorPath = insertAt.path;
            cursorOffset = insertAt.offset + text.length;
          } else {
            const parentPath = insertAt.path.slice(0, -1);
            const nodeIndex = insertAt.path[insertAt.path.length - 1];
            const hasBefore = insertAt.offset > 0;
            cursorPath = [...parentPath, nodeIndex + (hasBefore ? 1 : 0)];
            cursorOffset = text.length;
          }
        }

        tr.steps.push(tr_insertText(insertAt.path, insertAt.offset, text, newMarks));
        tr.steps.push(tr_setSelection(makeCollapsedSelection(makePosition(cursorPath, cursorOffset))));
        engine.dispatch(tr);
        return true;
      }

      // Collapsed with no text and no existing link — nothing to do
      return false;
    }

    // ── Case 2: range selected ────────────────────────────────────────────────
    // tr_setMark atomically removes any existing link mark then adds the new
    // one in a single pass — prevents nested/duplicate <a> tags.
    const { from, to } = normalizeRange(selection.anchor, selection.focus);
    tr.steps.push(tr_setMark(from, to, 'link', linkMark));

    // Restore the selection so the user sees the highlighted text after apply
    tr.steps.push(tr_setSelection(selection));
    engine.dispatch(tr);
    return true;
  };
}

/**
 * Remove the link mark from the whole link span the cursor is inside,
 * or from the explicit range when text is selected. Uses getActiveLinkRange
 * to walk sibling nodes with the same href so removing a collapsed-cursor
 * link clears the entire hyperlink, not just the one text node.
 */
export const removeLink: Command = (engine) => {
  const state = engine.getState();
  const { selection, doc } = state;
  if (!selection) return false;

  let from = selection.anchor;
  let to = selection.focus;

  if (selection.isCollapsed) {
    // Expand to full link span (all adjacent nodes sharing the same href)
    const linkRange = getActiveLinkRange(doc, selection);
    if (linkRange) {
      from = linkRange.from;
      to = linkRange.to;
    } else {
      // Fallback: at least cover the current text node
      const node = getNodeAtPath(doc, selection.anchor.path);
      if (node && isTextNode(node as EditorNode)) {
        from = makePosition(selection.anchor.path, 0);
        to = makePosition(selection.anchor.path, (node as TextNode).text.length);
      }
    }
  }

  const tr = createTransaction();
  tr.steps.push(tr_removeMark(from, to, 'link'));
  engine.dispatch(tr);
  return true;
};

// ─── Font Size ────────────────────────────────────────────────────────────────

/**
 * Set font size on the current selection, or null to remove it.
 * Collapsed cursor: updates pending marks so the next typed char gets the size.
 * Range selection: atomically replaces any existing font_size mark across the range.
 */
/**
 * Set highlight (background) color on the current selection, or null to remove it.
 * Uses setMarkOnRange for atomic replace so mixed-color ranges are handled cleanly.
 * Collapsed cursor: stores in pending marks for the next typed character.
 */
/**
 * Set text (foreground) color on the current selection, or null to remove it.
 * Collapsed cursor: stores in pending marks for the next typed character.
 * Range: atomically replaces any existing text_color mark across the range.
 */
export function setTextColor(color: string | null): Command {
  return (engine) => {
    const state = engine.getState();
    const { selection } = state;
    if (!selection) return false;

    const mark: Mark | null = color ? { type: 'text_color', attrs: { color } } : null;
    const tr = createTransaction();

    if (selection.isCollapsed) {
      const filtered = state.marks.filter((m) => m.type !== 'text_color');
      tr.meta.pendingMarks = mark ? [...filtered, mark] : filtered;
    } else {
      tr.steps.push(tr_setMark(selection.anchor, selection.focus, 'text_color', mark));
    }

    engine.dispatch(tr);
    return true;
  };
}

export function setHighlightColor(color: string | null): Command {
  return (engine) => {
    const state = engine.getState();
    const { selection } = state;
    if (!selection) return false;

    const mark: Mark | null = color ? { type: 'highlight', attrs: { color } } : null;
    const tr = createTransaction();

    if (selection.isCollapsed) {
      const filtered = state.marks.filter((m) => m.type !== 'highlight');
      tr.meta.pendingMarks = mark ? [...filtered, mark] : filtered;
    } else {
      tr.steps.push(tr_setMark(selection.anchor, selection.focus, 'highlight', mark));
    }

    engine.dispatch(tr);
    return true;
  };
}

export function setFontFamily(family: string | null): Command {
  return (engine) => {
    const state = engine.getState();
    const { selection } = state;
    if (!selection) return false;

    const mark: Mark | null = family ? { type: 'font_family', attrs: { family } } : null;
    const tr = createTransaction();

    if (selection.isCollapsed) {
      const filtered = state.marks.filter((m) => m.type !== 'font_family');
      tr.meta.pendingMarks = mark ? [...filtered, mark] : filtered;
    } else {
      tr.steps.push(tr_setMark(selection.anchor, selection.focus, 'font_family', mark));
    }

    engine.dispatch(tr);
    return true;
  };
}

export function setFontSize(size: string | null): Command {
  return (engine) => {
    const state = engine.getState();
    const { selection } = state;
    if (!selection) return false;

    const mark: Mark | null = size ? { type: 'font_size', attrs: { size } } : null;
    const tr = createTransaction();

    if (selection.isCollapsed) {
      const filtered = state.marks.filter((m) => m.type !== 'font_size');
      tr.meta.pendingMarks = mark ? [...filtered, mark] : filtered;
    } else {
      tr.steps.push(tr_setMark(selection.anchor, selection.focus, 'font_size', mark));
    }

    engine.dispatch(tr);
    return true;
  };
}

// ─── Alignment ───────────────────────────────────────────────────────────────

/**
 * Set text alignment on the content block at the cursor.
 * Clicking the active alignment again removes it (reverts to default left).
 * Applies to: paragraph, heading, blockquote, list_item.
 */
export function setAlignment(align: import('../../types').AlignmentType): Command {
  return (engine) => {
    const state = engine.getState();
    const { doc, selection } = state;
    if (!selection) return false;

    const blockPath = findContentBlockPath(doc, selection.anchor.path);
    if (!blockPath) return false;

    const block = getNodeAtPath(doc, blockPath) as import('../../types').BlockNode | null;
    if (!block) return false;

    // Toggle off if same alignment is clicked again
    const current = block.attrs?.align as string | undefined;
    const next = current === align ? undefined : align;

    const tr = createTransaction();
    tr.steps.push(tr_setNodeAttrs(blockPath, { align: next }));
    engine.dispatch(tr);
    return true;
  };
}

export const alignLeft    = setAlignment('left');
export const alignCenter  = setAlignment('center');
export const alignRight   = setAlignment('right');
export const alignJustify = setAlignment('justify');

// ─── Image ────────────────────────────────────────────────────────────────────

export function insertImage(src: string, alt = '', extraAttrs?: Record<string, unknown>): Command {
  return (engine) => {
    const state = engine.getState();
    const { selection } = state;
    if (!selection) return false;

    const blockPath = findContentBlockPath(state.doc, selection.anchor.path) ?? [0];
    const parentPath = blockPath.slice(0, -1);
    const insertIdx = blockPath[blockPath.length - 1] + 1;

    const imageNode: BlockNode = {
      type: 'image',
      attrs: { src, alt, ...extraAttrs },
      children: [],
    };

    const tr = createTransaction();
    tr.steps.push({ type: 'insert_node', parentPath, index: insertIdx, node: imageNode });
    engine.dispatch(tr);
    return true;
  };
}

export function setImageAttr(imagePath: number[], attrs: Record<string, unknown>): Command {
  return (engine) => {
    const state = engine.getState();
    const node = getNodeAtPath(state.doc, imagePath);
    if (!node || (node as BlockNode).type !== 'image') return false;
    const updated: BlockNode = {
      ...(node as BlockNode),
      attrs: { ...(node as BlockNode).attrs, ...attrs },
    };
    const tr = createTransaction();
    tr.steps.push({ type: 'delete_node', path: imagePath });
    tr.steps.push({
      type: 'insert_node',
      parentPath: imagePath.length > 1 ? imagePath.slice(0, -1) : [],
      index: imagePath[imagePath.length - 1],
      node: updated,
    });
    engine.dispatch(tr);
    return true;
  };
}

export function deleteImageAtPath(imagePath: number[]): Command {
  return (engine) => {
    const state = engine.getState();
    const node = getNodeAtPath(state.doc, imagePath);
    if (!node || (node as BlockNode).type !== 'image') return false;
    const tr = createTransaction();
    tr.steps.push({ type: 'delete_node', path: imagePath });
    engine.dispatch(tr);
    return true;
  };
}

// ─── Horizontal Rule ─────────────────────────────────────────────────────────

/**
 * Insert a horizontal rule after the current block.
 * Always appends an empty paragraph after the HR so the cursor has
 * somewhere to land and the user can continue typing.
 */
export const insertHorizontalRule: Command = (engine) => {
  const state = engine.getState();
  const { selection, doc } = state;
  if (!selection) return false;

  const blockPath = findContentBlockPath(doc, selection.anchor.path) ?? [0];
  const parentPath = blockPath.slice(0, -1);
  const afterIdx = blockPath[blockPath.length - 1] + 1;

  const hrNode: BlockNode = { type: 'horizontal_rule', attrs: {}, children: [] };
  const paraNode = createParagraph();

  const tr = createTransaction();
  tr.steps.push({ type: 'insert_node', parentPath, index: afterIdx,     node: hrNode });
  tr.steps.push({ type: 'insert_node', parentPath, index: afterIdx + 1, node: paraNode });
  // Land cursor at the new empty paragraph (block-level path, offset 0).
  tr.steps.push(tr_setSelection(
    makeCollapsedSelection(makePosition([...parentPath, afterIdx + 1], 0)),
  ));
  engine.dispatch(tr);
  return true;
};

/**
 * Skip the cursor over an adjacent horizontal_rule node.
 * Returns true (consumed) only when it actually jumps over an HR.
 * Only handles top-level blocks — HRs inside lists are not expected.
 */
function jumpOverHR(engine: EditorEngineInterface, dir: 'down' | 'up'): boolean {
  const state = engine.getState();
  const { doc, selection } = state;
  if (!selection) return false;

  const blockPath = findContentBlockPath(doc, selection.anchor.path);
  if (!blockPath || blockPath.length !== 1) return false;

  const idx = blockPath[0];
  const neighborIdx = dir === 'down' ? idx + 1 : idx - 1;
  const neighbor = doc.children[neighborIdx];
  if (!neighbor || neighbor.type !== 'horizontal_rule') return false;

  const destIdx = dir === 'down' ? neighborIdx + 1 : neighborIdx - 1;
  const dest = doc.children[destIdx];
  if (!dest) return false;

  const tr = createTransaction();
  tr.steps.push(tr_setSelection(
    makeCollapsedSelection(makePosition([destIdx], 0)),
  ));
  engine.dispatch(tr);
  return true;
}

// ─── Select All ───────────────────────────────────────────────────────────────

export const selectAll: Command = (engine) => {
  const state = engine.getState();
  const { doc } = state;
  const lastBlock = doc.children[doc.children.length - 1];
  if (!lastBlock) return false;

  const lastIdx = doc.children.length - 1;
  const lastChildren = lastBlock.children;
  const focusChildIdx = Math.max(lastChildren.length - 1, 0);
  const lastChild = lastChildren[focusChildIdx];
  const lastTextOffset =
    lastChild && isTextNode(lastChild) ? (lastChild as TextNode).text.length : 0;

  const tr = createTransaction();
  tr.steps.push(tr_setSelection({
    anchor: makePosition([0, 0], 0),
    focus: makePosition([lastIdx, focusChildIdx], lastTextOffset),
    isCollapsed: false,
  }));
  engine.dispatch(tr);
  return true;
};

// ─── Keyboard Shortcut Bindings ───────────────────────────────────────────────

/**
 * Default keyboard shortcuts. Register this as a plugin.
 */
export const defaultKeyboardPlugin = {
  name: 'default-keyboard',
  keyBindings: {
    'ArrowDown': (engine: EditorEngineInterface) => jumpOverHR(engine, 'down'),
    'ArrowUp':   (engine: EditorEngineInterface) => jumpOverHR(engine, 'up'),
    'Ctrl+b': toggleBold,
    'Ctrl+B': toggleBold,
    'Ctrl+i': toggleItalic,
    'Ctrl+I': toggleItalic,
    'Ctrl+u': toggleUnderline,
    'Ctrl+U': toggleUnderline,
    'Ctrl+Shift+x': toggleStrikethrough,
    'Ctrl+Shift+X': toggleStrikethrough,
    'Ctrl+e': toggleCode,
    'Ctrl+E': toggleCode,
    'Ctrl+a': selectAll,
    'Ctrl+A': selectAll,
    'Ctrl+Shift+7': toggleOrderedList,
    'Ctrl+Shift+8': toggleBulletList,
    'Ctrl+Shift+9': toggleCheckList,
    'Ctrl+Shift+.': setBlockquote,
    'Ctrl+Shift+c': setCodeBlock,
    'Ctrl+Shift+C': setCodeBlock,
    // Alignment shortcuts (Shift produces uppercase key)
    'Ctrl+Shift+L': alignLeft,
    'Ctrl+Shift+E': alignCenter,
    'Ctrl+Shift+R': alignRight,
    'Ctrl+Shift+J': alignJustify,
  },
};
