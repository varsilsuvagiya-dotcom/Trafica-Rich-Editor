/**
 * DocumentModel
 *
 * Provides utilities for navigating, reading, and immutably modifying the
 * document tree. None of these functions mutate their inputs — they always
 * return new objects. This is the single source of truth for document shape.
 *
 * Architecture note:
 *   The document is a tree: doc → [block] → [block | text]*
 *   All positions are expressed as (path, offset) pairs, not DOM positions.
 *   This makes every operation deterministic and testable outside the browser.
 */

import type {
  Document,
  EditorNode,
  BlockNode,
  TextNode,
  Mark,
  MarkType,
  NodePosition,
  BlockNodeType,
  NodeAttrs,
  EditorSelection,
} from '../../types';

// ─── Predicates ──────────────────────────────────────────────────────────────

export function isTextNode(node: EditorNode): node is TextNode {
  return node.type === 'text';
}

export function isBlockNode(node: EditorNode): node is BlockNode {
  return node.type !== 'text';
}

/**
 * Container blocks hold other blocks (not inline content directly).
 * Used to skip past list wrappers when finding the "content block" a cursor is in.
 */
export function isContainerBlock(type: string): boolean {
  return (
    type === 'bullet_list' || type === 'ordered_list' || type === 'check_list' ||
    type === 'table' || type === 'table_row' || type === 'table_cell' || type === 'table_header' ||
    type === 'doc'
  );
}

// ─── Path & Position Comparison ───────────────────────────────────────────────

/**
 * Compare two paths in document order.
 *   [0] < [0,0] < [0,1] < [1]
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function comparePaths(a: number[], b: number[]): -1 | 0 | 1 {
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

export function comparePositions(a: NodePosition, b: NodePosition): -1 | 0 | 1 {
  const c = comparePaths(a.path, b.path);
  if (c !== 0) return c;
  if (a.offset < b.offset) return -1;
  if (a.offset > b.offset) return 1;
  return 0;
}

/**
 * Return from/to in document order (from ≤ to).
 */
export function normalizeRange(
  from: NodePosition,
  to: NodePosition,
): { from: NodePosition; to: NodePosition } {
  return comparePositions(from, to) <= 0 ? { from, to } : { from: to, to: from };
}

/**
 * Walk up the path to find the deepest *content* block containing it.
 * Skips container blocks (bullet_list, ordered_list, doc).
 * Used by commands to find the block to set type on, split, etc.
 */
export function findContentBlockPath(doc: Document, path: number[]): number[] | null {
  for (let depth = path.length; depth >= 1; depth--) {
    const candidate = path.slice(0, depth);
    const node = getNodeAtPath(doc, candidate);
    if (!node) continue;
    if (isTextNode(node as EditorNode)) continue;
    if (isContainerBlock((node as EditorNode).type)) continue;
    return candidate;
  }
  return null;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

/**
 * Walk a path through the document to retrieve a node.
 * path=[] returns the doc root itself.
 * path=[0] returns doc.children[0].
 * path=[0,2] returns doc.children[0].children[2].
 */
export function getNodeAtPath(doc: Document, path: number[]): EditorNode | Document | null {
  if (path.length === 0) return doc;
  let current: EditorNode | Document = doc;
  for (const idx of path) {
    if (isTextNode(current as EditorNode)) return null;
    const block = current as BlockNode | Document;
    const children = (block as BlockNode).children ?? (block as Document).children;
    if (!children || idx >= children.length) return null;
    current = children[idx];
  }
  return current;
}

/**
 * Immutably replace the node at path with a new node.
 * Uses structural sharing: only nodes on the path are copied.
 */
export function setNodeAtPath(
  doc: Document,
  path: number[],
  newNode: EditorNode,
): Document {
  if (path.length === 0) {
    // Replacing the root — caller should use replaceDoc step instead
    return doc;
  }
  return setChildAtPath(doc, path, newNode) as Document;
}

function setChildAtPath(
  node: Document | EditorNode,
  path: number[],
  newNode: EditorNode,
): Document | EditorNode {
  if (path.length === 0) return newNode;

  const [idx, ...rest] = path;
  const parent = node as BlockNode | Document;
  const children = [...(parent.children as EditorNode[])];
  children[idx] = setChildAtPath(children[idx], rest, newNode) as EditorNode;

  if ((node as Document).type === 'doc') {
    return { ...(node as Document), children: children as BlockNode[] };
  }
  return { ...(node as BlockNode), children };
}

/**
 * Insert a node into a parent's children array at a given index.
 */
export function insertNodeAtPath(
  doc: Document,
  parentPath: number[],
  index: number,
  newNode: EditorNode,
): Document {
  const parent = getNodeAtPath(doc, parentPath);
  if (!parent || isTextNode(parent as EditorNode)) return doc;

  const block = parent as BlockNode | Document;
  const children = [...(block.children as EditorNode[])];
  children.splice(index, 0, newNode);

  if (parentPath.length === 0) {
    return { ...(doc as Document), children: children as BlockNode[] };
  }

  const updatedParent: EditorNode = { ...(block as BlockNode), children };
  return setNodeAtPath(doc, parentPath, updatedParent);
}

/**
 * Remove the node at path from the tree.
 */
export function removeNodeAtPath(doc: Document, path: number[]): Document {
  if (path.length === 0) return doc;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];

  const parent = getNodeAtPath(doc, parentPath);
  if (!parent || isTextNode(parent as EditorNode)) return doc;

  const block = parent as BlockNode | Document;
  const children = [...(block.children as EditorNode[])];
  children.splice(idx, 1);

  if (parentPath.length === 0) {
    return { ...doc, children: children as BlockNode[] };
  }

  const updatedParent: EditorNode = { ...(block as BlockNode), children };
  return setNodeAtPath(doc, parentPath, updatedParent);
}

// ─── Text Manipulation ────────────────────────────────────────────────────────

/**
 * Insert text at offset inside a TextNode at path, applying marks.
 * If the path points to a block node (e.g. empty paragraph), a new text node
 * is created and inserted as the first child, then text is placed inside it.
 * Returns the modified document AND the resolved path to the text node
 * (callers use this to correctly advance the cursor).
 */
export function insertTextAtPath(
  doc: Document,
  path: number[],
  offset: number,
  text: string,
  marks: Mark[],
): Document {
  const node = getNodeAtPath(doc, path);
  if (!node) return doc;

  // ── Path points to a block node (empty paragraph, etc.) ──────────────────
  if (!isTextNode(node as EditorNode)) {
    const block = node as BlockNode;
    // Find or create the first text child
    if (block.children.length === 0) {
      // Truly empty block: create a new text node
      const newTextNode: TextNode = { type: 'text', text, marks };
      return setNodeAtPath(doc, path, { ...block, children: [newTextNode] });
    }
    // Has children: delegate to the first text child
    const firstTextIdx = block.children.findIndex((c) => isTextNode(c));
    if (firstTextIdx !== -1) {
      return insertTextAtPath(doc, [...path, firstTextIdx], offset, text, marks);
    }
    // No text children but has block children: prepend a new text node
    const newTextNode: TextNode = { type: 'text', text, marks };
    const updated: BlockNode = { ...block, children: [newTextNode, ...block.children] };
    return setNodeAtPath(doc, path, updated);
  }

  const textNode = node as TextNode;

  if (marksEqual(textNode.marks, marks)) {
    // Same marks: just splice the string in
    const newText = textNode.text.slice(0, offset) + text + textNode.text.slice(offset);
    return setNodeAtPath(doc, path, { ...textNode, text: newText });
  }

  // Different marks: split the text node into up to 3 parts
  const parentPath = path.slice(0, -1);
  const nodeIndex = path[path.length - 1];
  const before = textNode.text.slice(0, offset);
  const after = textNode.text.slice(offset);

  const newNodes: EditorNode[] = [];
  if (before) newNodes.push({ type: 'text', text: before, marks: textNode.marks });
  newNodes.push({ type: 'text', text, marks });
  if (after) newNodes.push({ type: 'text', text: after, marks: textNode.marks });

  // Remove the original node and insert the new parts
  let result = removeNodeAtPath(doc, path);
  for (let i = newNodes.length - 1; i >= 0; i--) {
    result = insertNodeAtPath(result, parentPath, nodeIndex, newNodes[i]);
  }
  return result;
}

/**
 * Delete characters in range [from, to) within a TextNode at path.
 */
export function deleteTextAtPath(
  doc: Document,
  path: number[],
  from: number,
  to: number,
): Document {
  const node = getNodeAtPath(doc, path);
  if (!node || !isTextNode(node as EditorNode)) return doc;
  const textNode = node as TextNode;
  const newText = textNode.text.slice(0, from) + textNode.text.slice(to);

  if (newText === '') {
    // Remove the empty text node entirely
    return removeNodeAtPath(doc, path);
  }
  return setNodeAtPath(doc, path, { ...textNode, text: newText });
}

// ─── Mark Application ─────────────────────────────────────────────────────────

/**
 * Add a mark to an entire TextNode at path. Used internally; commands should
 * prefer applyMarkToRange for partial selections.
 */
export function addMarkToNode(doc: Document, path: number[], mark: Mark): Document {
  const node = getNodeAtPath(doc, path);
  if (!node || !isTextNode(node as EditorNode)) return doc;
  const textNode = node as TextNode;

  if (textNode.marks.some((m) => m.type === mark.type)) return doc;
  return setNodeAtPath(doc, path, {
    ...textNode,
    marks: [...textNode.marks, mark],
  });
}

/**
 * Remove a mark from an entire TextNode at path. Internal — use removeMarkFromRange.
 */
export function removeMarkFromNode(
  doc: Document,
  path: number[],
  markType: MarkType,
): Document {
  const node = getNodeAtPath(doc, path);
  if (!node || !isTextNode(node as EditorNode)) return doc;
  const textNode = node as TextNode;
  return setNodeAtPath(doc, path, {
    ...textNode,
    marks: textNode.marks.filter((m) => m.type !== markType),
  });
}

/**
 * Split a TextNode at a character offset, producing two adjacent text nodes
 * that share the original's marks. Returns the path to each half.
 * If offset is at a boundary, no split is performed.
 */
export function splitTextNodeAt(
  doc: Document,
  path: number[],
  offset: number,
): { doc: Document; firstPath: number[]; secondPath: number[] } {
  const node = getNodeAtPath(doc, path);
  if (!node || !isTextNode(node as EditorNode)) {
    return { doc, firstPath: path, secondPath: path };
  }
  const textNode = node as TextNode;

  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];

  if (offset <= 0) {
    return { doc, firstPath: path, secondPath: path };
  }
  if (offset >= textNode.text.length) {
    return { doc, firstPath: path, secondPath: [...parentPath, idx + 1] };
  }

  const firstNode: TextNode = {
    type: 'text',
    text: textNode.text.slice(0, offset),
    marks: textNode.marks,
  };
  const secondNode: TextNode = {
    type: 'text',
    text: textNode.text.slice(offset),
    marks: textNode.marks,
  };

  let result = setNodeAtPath(doc, path, firstNode);
  result = insertNodeAtPath(result, parentPath, idx + 1, secondNode);

  return { doc: result, firstPath: path, secondPath: [...parentPath, idx + 1] };
}

/**
 * Apply (or remove) a mark across an arbitrary text range.
 * Splits text nodes at the range boundaries when offsets fall mid-node,
 * then mutates the marks of every text node strictly inside the range.
 */
export function applyMarkToRange(
  doc: Document,
  from: NodePosition,
  to: NodePosition,
  mark: Mark,
): Document {
  return mutateMarksInRange(doc, from, to, (marks) =>
    marks.some((m) => m.type === mark.type) ? marks : [...marks, mark],
  );
}

export function removeMarkFromRange(
  doc: Document,
  from: NodePosition,
  to: NodePosition,
  markType: MarkType,
): Document {
  return mutateMarksInRange(doc, from, to, (marks) =>
    marks.filter((m) => m.type !== markType),
  );
}

/**
 * Atomically replace a mark type across a range in one pass.
 * If mark is null, the mark type is removed from every node in the range.
 * This avoids the path-shift bug that occurs when remove_mark + add_mark
 * steps are used separately in sequence.
 */
export function setMarkOnRange(
  doc: Document,
  from: NodePosition,
  to: NodePosition,
  markType: MarkType,
  mark: Mark | null,
): Document {
  return mutateMarksInRange(doc, from, to, (marks) => {
    const filtered = marks.filter((m) => m.type !== markType);
    return mark ? [...filtered, mark] : filtered;
  });
}

function mutateMarksInRange(
  doc: Document,
  rawFrom: NodePosition,
  rawTo: NodePosition,
  mutate: (marks: Mark[]) => Mark[],
): Document {
  const { from, to } = normalizeRange(rawFrom, rawTo);

  const nodes = getTextNodesBetween(doc, from, to);
  if (nodes.length === 0) return doc;

  let result = doc;

  // Iterate in reverse so splitting earlier nodes doesn't shift later paths.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { path, node } = nodes[i];
    const isFirst = i === 0;
    const isLast = i === nodes.length - 1;

    let markPath = path;

    if (isLast && comparePaths(path, to.path) === 0 && to.offset < node.text.length) {
      const split = splitTextNodeAt(result, path, to.offset);
      result = split.doc;
      markPath = split.firstPath;
    }

    if (isFirst && comparePaths(path, from.path) === 0 && from.offset > 0) {
      const split = splitTextNodeAt(result, markPath, from.offset);
      result = split.doc;
      markPath = split.secondPath;
    }

    const target = getNodeAtPath(result, markPath);
    if (target && isTextNode(target as EditorNode)) {
      const t = target as TextNode;
      const newMarks = mutate(t.marks);
      result = setNodeAtPath(result, markPath, { ...t, marks: newMarks });
    }
  }

  return mergeAdjacentTextNodesInDoc(result);
}

/**
 * Walk the doc and merge consecutive text-node siblings that share identical marks.
 * Called after mark/delete operations to keep the model tidy.
 */
export function mergeAdjacentTextNodesInDoc(doc: Document): Document {
  function mergeChildren(children: EditorNode[]): EditorNode[] {
    const merged: EditorNode[] = [];
    for (const child of children) {
      if (isTextNode(child)) {
        const last = merged[merged.length - 1];
        if (last && isTextNode(last) && marksEqual(last.marks, child.marks)) {
          merged[merged.length - 1] = { ...last, text: last.text + child.text };
          continue;
        }
        merged.push(child);
      } else {
        const block = child as BlockNode;
        merged.push({ ...block, children: mergeChildren(block.children) });
      }
    }
    return merged;
  }

  return { ...doc, children: mergeChildren(doc.children) as BlockNode[] };
}

/**
 * Delete the text in [from, to). Handles three cases:
 *   1. Both positions in the same text node → splice the string.
 *   2. Both positions in the same content block but different text nodes →
 *      trim the from-node tail, remove middle nodes, trim the to-node head.
 *   3. Positions in different content blocks → trim each end, remove blocks in
 *      between, then join the surviving blocks.
 * Returns the new document and the resulting collapsed cursor position.
 */
export function deleteRange(
  doc: Document,
  rawFrom: NodePosition,
  rawTo: NodePosition,
): { doc: Document; cursor: NodePosition } {
  const { from, to } = normalizeRange(rawFrom, rawTo);
  if (comparePositions(from, to) === 0) return { doc, cursor: from };

  // Case 1: same text node
  if (comparePaths(from.path, to.path) === 0) {
    const node = getNodeAtPath(doc, from.path);
    if (node && isTextNode(node as EditorNode)) {
      const t = node as TextNode;
      const newText = t.text.slice(0, from.offset) + t.text.slice(to.offset);
      const result =
        newText === ''
          ? removeNodeAtPath(doc, from.path)
          : setNodeAtPath(doc, from.path, { ...t, text: newText });
      return {
        doc: mergeAdjacentTextNodesInDoc(result),
        cursor: { path: from.path, offset: from.offset },
      };
    }
    return { doc, cursor: from };
  }

  const fromBlockPath = findContentBlockPath(doc, from.path);
  const toBlockPath = findContentBlockPath(doc, to.path);
  if (!fromBlockPath || !toBlockPath) return { doc, cursor: from };

  // Case 2: same content block, different text nodes
  if (comparePaths(fromBlockPath, toBlockPath) === 0) {
    const result = deleteWithinBlock(doc, from, to);
    return {
      doc: mergeAdjacentTextNodesInDoc(result),
      cursor: { path: from.path, offset: from.offset },
    };
  }

  // Case 3: cross-block delete + join
  let result = doc;
  // Trim from-block tail (from.offset → end of text in from-node, then remove later siblings in block)
  result = trimBlockAfter(result, fromBlockPath, from);
  // Trim to-block head (start → to.offset)
  const toBlockPathAfter = toBlockPath; // path indices in the to-block are unchanged so far
  result = trimBlockBefore(result, toBlockPathAfter, to);
  // Remove blocks strictly between from-block and to-block
  result = removeBlocksBetween(result, fromBlockPath, toBlockPathAfter);
  // Join the to-block (now at fromBlockPath[last]+1) into the from-block
  const joinPath = [...fromBlockPath.slice(0, -1), fromBlockPath[fromBlockPath.length - 1] + 1];
  result = joinBlocks(result, joinPath);

  return {
    doc: mergeAdjacentTextNodesInDoc(result),
    cursor: { path: from.path, offset: from.offset },
  };
}

function deleteWithinBlock(doc: Document, from: NodePosition, to: NodePosition): Document {
  let result = doc;

  // Step 1: trim to-node head (remove [0, to.offset))
  const toNode = getNodeAtPath(result, to.path);
  if (toNode && isTextNode(toNode as EditorNode)) {
    const t = toNode as TextNode;
    if (to.offset >= t.text.length) {
      result = removeNodeAtPath(result, to.path);
    } else if (to.offset > 0) {
      result = setNodeAtPath(result, to.path, { ...t, text: t.text.slice(to.offset) });
    }
  }

  // Step 2: remove all text nodes strictly between from.path and to.path (exclusive)
  // We re-fetch each pass since paths shift after each removal. Walk in reverse.
  const between = collectPathsStrictlyBetween(result, from.path, to.path);
  for (let i = between.length - 1; i >= 0; i--) {
    result = removeNodeAtPath(result, between[i]);
  }

  // Step 3: trim from-node tail (remove [from.offset, end))
  const fromNode = getNodeAtPath(result, from.path);
  if (fromNode && isTextNode(fromNode as EditorNode)) {
    const t = fromNode as TextNode;
    if (from.offset <= 0) {
      result = removeNodeAtPath(result, from.path);
    } else if (from.offset < t.text.length) {
      result = setNodeAtPath(result, from.path, { ...t, text: t.text.slice(0, from.offset) });
    }
  }

  return result;
}

function collectPathsStrictlyBetween(
  doc: Document,
  from: number[],
  to: number[],
): number[][] {
  const results: number[][] = [];
  walkDocument(doc, (node, path) => {
    if (!isTextNode(node as EditorNode)) return;
    if (comparePaths(path, from) > 0 && comparePaths(path, to) < 0) {
      results.push([...path]);
    }
  });
  return results;
}

function trimBlockAfter(doc: Document, blockPath: number[], from: NodePosition): Document {
  let result = doc;
  // Trim from-node tail
  const fromNode = getNodeAtPath(result, from.path);
  if (fromNode && isTextNode(fromNode as EditorNode)) {
    const t = fromNode as TextNode;
    if (from.offset <= 0) {
      result = removeNodeAtPath(result, from.path);
    } else if (from.offset < t.text.length) {
      result = setNodeAtPath(result, from.path, { ...t, text: t.text.slice(0, from.offset) });
    }
  }
  // Remove later children of the block (after from.path within blockPath)
  const block = getNodeAtPath(result, blockPath);
  if (block && !isTextNode(block as EditorNode)) {
    const b = block as BlockNode;
    const fromChildIdx = from.path[blockPath.length];
    const keep = b.children.slice(0, fromChildIdx + 1);
    result = setNodeAtPath(result, blockPath, { ...b, children: keep });
  }
  return result;
}

function trimBlockBefore(doc: Document, blockPath: number[], to: NodePosition): Document {
  let result = doc;
  // Trim to-node head
  const toNode = getNodeAtPath(result, to.path);
  if (toNode && isTextNode(toNode as EditorNode)) {
    const t = toNode as TextNode;
    if (to.offset >= t.text.length) {
      result = removeNodeAtPath(result, to.path);
    } else if (to.offset > 0) {
      result = setNodeAtPath(result, to.path, { ...t, text: t.text.slice(to.offset) });
    }
  }
  // Remove earlier children of the block (before to.path within blockPath)
  const block = getNodeAtPath(result, blockPath);
  if (block && !isTextNode(block as EditorNode)) {
    const b = block as BlockNode;
    const toChildIdx = to.path[blockPath.length];
    const keep = b.children.slice(toChildIdx);
    result = setNodeAtPath(result, blockPath, { ...b, children: keep });
  }
  return result;
}

function removeBlocksBetween(doc: Document, fromBlockPath: number[], toBlockPath: number[]): Document {
  // Only handles same-parent block ranges for now (top-level blocks).
  if (fromBlockPath.length !== toBlockPath.length) return doc;
  const parent = fromBlockPath.slice(0, -1);
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] !== toBlockPath[i]) return doc;
  }
  const fromIdx = fromBlockPath[fromBlockPath.length - 1];
  const toIdx = toBlockPath[toBlockPath.length - 1];
  let result = doc;
  // Remove indices fromIdx+1 ... toIdx-1 in reverse
  for (let i = toIdx - 1; i > fromIdx; i--) {
    result = removeNodeAtPath(result, [...parent, i]);
  }
  return result;
}

// ─── Block Manipulation ───────────────────────────────────────────────────────

/**
 * Split a block at a character offset (measured in flat text of the block).
 * Preserves marks: each side keeps the formatting it had.
 * The second block's type is decided by SPLIT_TYPE_RULES (e.g. heading → paragraph,
 * list_item → list_item).
 */
export function splitBlock(doc: Document, path: number[], offset: number): Document {
  const node = getNodeAtPath(doc, path);
  if (!node || isTextNode(node as EditorNode)) return doc;
  const block = node as BlockNode;

  const { left, right } = splitChildrenAtOffset(block.children, offset);

  const secondType: BlockNodeType = SPLIT_TYPE_RULES[block.type] ?? 'paragraph';
  const firstBlock: BlockNode = { ...block, children: left };
  const secondBlock: BlockNode = {
    type: secondType,
    attrs: secondType === block.type ? { ...block.attrs } : {},
    children: right,
  };

  const parentPath = path.slice(0, -1);
  const blockIndex = path[path.length - 1];

  let result = removeNodeAtPath(doc, path);
  result = insertNodeAtPath(result, parentPath, blockIndex, secondBlock);
  result = insertNodeAtPath(result, parentPath, blockIndex, firstBlock);
  return result;
}

/**
 * When you press Enter inside a block of `type`, the *new* block created below
 * should be of this type. Most content blocks split into a paragraph; lists
 * and code blocks continue as the same type.
 */
const SPLIT_TYPE_RULES: Partial<Record<BlockNodeType, BlockNodeType>> = {
  paragraph: 'paragraph',
  heading: 'paragraph',
  blockquote: 'paragraph',
  list_item: 'list_item',
  check_list_item: 'check_list_item',
  code_block: 'code_block',
};

/**
 * Split a children array into two halves at a flat text offset, preserving marks.
 * Text nodes that span the split point are sliced; both halves keep the original marks.
 */
function splitChildrenAtOffset(
  children: EditorNode[],
  offset: number,
): { left: EditorNode[]; right: EditorNode[] } {
  const left: EditorNode[] = [];
  const right: EditorNode[] = [];
  let consumed = 0;
  let done = false;

  for (const child of children) {
    if (done) {
      right.push(child);
      continue;
    }
    if (isTextNode(child)) {
      const len = child.text.length;
      if (consumed + len <= offset) {
        left.push(child);
        consumed += len;
        continue;
      }
      const cut = offset - consumed;
      if (cut > 0) {
        left.push({ ...child, text: child.text.slice(0, cut) });
      }
      if (cut < len) {
        right.push({ ...child, text: child.text.slice(cut) });
      }
      done = true;
    } else {
      // Non-text child: keep on left until offset is reached, then on right.
      // For mixed content blocks we don't try to split inside an inline block.
      const len = collectText(child as BlockNode).length;
      if (consumed + len <= offset) {
        left.push(child);
        consumed += len;
      } else {
        right.push(child);
        done = true;
      }
    }
  }

  return { left, right };
}

/**
 * Join the block at path with the previous sibling block.
 */
export function joinBlocks(doc: Document, path: number[]): Document {
  const idx = path[path.length - 1];
  if (idx === 0) return doc;

  const parentPath = path.slice(0, -1);
  const prevPath = [...parentPath, idx - 1];

  const prevNode = getNodeAtPath(doc, prevPath);
  const curNode = getNodeAtPath(doc, path);

  if (
    !prevNode ||
    !curNode ||
    isTextNode(prevNode as EditorNode) ||
    isTextNode(curNode as EditorNode)
  )
    return doc;

  const prevBlock = prevNode as BlockNode;
  const curBlock = curNode as BlockNode;

  const mergedChildren = [...prevBlock.children, ...curBlock.children];
  const mergedBlock: BlockNode = { ...prevBlock, children: mergedChildren };

  let result = removeNodeAtPath(doc, path);
  result = setNodeAtPath(result, prevPath, mergedBlock);
  return mergeAdjacentTextNodesInDoc(result);
}

/**
 * Merge attrs into a block node without changing its type.
 * Values in `attrs` override existing attrs; keys set to undefined are removed.
 */
export function setNodeAttrs(
  doc: Document,
  path: number[],
  attrs: NodeAttrs,
): Document {
  const node = getNodeAtPath(doc, path);
  if (!node || isTextNode(node as EditorNode)) return doc;
  const block = node as BlockNode;
  // Merge: explicit undefined values remove the key
  const merged: NodeAttrs = { ...block.attrs };
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }
  return setNodeAtPath(doc, path, { ...block, attrs: merged });
}

/**
 * Change the type of a block node.
 */
export function setBlockType(
  doc: Document,
  path: number[],
  nodeType: BlockNodeType,
  attrs: NodeAttrs = {},
): Document {
  const node = getNodeAtPath(doc, path);
  if (!node || isTextNode(node as EditorNode)) return doc;
  const block = node as BlockNode;
  return setNodeAtPath(doc, path, { ...block, type: nodeType, attrs: { ...block.attrs, ...attrs } });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flatten all text content of a block node into a single string.
 */
export function collectText(node: BlockNode | Document): string {
  return (node.children as EditorNode[])
    .map((child) => {
      if (isTextNode(child)) return child.text;
      if (isBlockNode(child)) return collectText(child as BlockNode);
      return '';
    })
    .join('');
}

/**
 * Check if two mark arrays are equivalent (type AND attrs must match).
 * Attrs comparison prevents adjacent text nodes with different font-size/link
 * marks from being incorrectly merged into one.
 */
export function marksEqual(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.type.localeCompare(y.type));
  const sortedB = [...b].sort((x, y) => x.type.localeCompare(y.type));
  return sortedA.every((m, i) => {
    if (m.type !== sortedB[i].type) return false;
    const aAttrs = m.attrs ?? {};
    const bAttrs = sortedB[i].attrs ?? {};
    const aKeys = Object.keys(aAttrs);
    const bKeys = Object.keys(bAttrs);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => aAttrs[k] === bAttrs[k]);
  });
}

/**
 * Create an empty paragraph block.
 */
export function createParagraph(text = ''): BlockNode {
  return {
    type: 'paragraph',
    attrs: {},
    children: text ? [{ type: 'text', text, marks: [] }] : [],
  };
}

/**
 * Create an empty document.
 */
export function createEmptyDocument(): Document {
  return {
    type: 'doc',
    children: [createParagraph()],
  };
}

/**
 * Walk every node in the document (depth-first), calling visitor.
 * Visitor receives (node, path). Return false to stop traversal.
 */
export function walkDocument(
  doc: Document,
  visitor: (node: EditorNode | Document, path: number[]) => boolean | void,
): void {
  function walk(node: EditorNode | Document, path: number[]): boolean {
    const result = visitor(node, path);
    if (result === false) return false;

    if (!isTextNode(node as EditorNode)) {
      const parent = node as BlockNode | Document;
      const children = parent.children as EditorNode[];
      for (let i = 0; i < children.length; i++) {
        if (!walk(children[i], [...path, i])) return false;
      }
    }
    return true;
  }
  walk(doc, []);
}

/**
 * Walk the document and collect all unique values of a specific mark attribute.
 * Used to populate "Document colors" sections in color pickers.
 * Returns values in first-seen order, deduplicated.
 */
export function getDocumentMarkAttrValues(
  doc: Document,
  markType: MarkType,
  attrKey: string,
): string[] {
  const seen = new Set<string>();
  walkDocument(doc, (node) => {
    if (!isTextNode(node as EditorNode)) return;
    const m = (node as TextNode).marks.find((mk) => mk.type === markType);
    const v = m?.attrs?.[attrKey];
    if (typeof v === 'string' && v) seen.add(v);
  });
  return [...seen];
}

/**
 * Compute the total text length of the document (sum of all text nodes).
 */
export function getDocumentLength(doc: Document): number {
  let len = 0;
  walkDocument(doc, (node) => {
    if (isTextNode(node as EditorNode)) {
      len += (node as TextNode).text.length;
    }
  });
  return len;
}

/**
 * Find all text nodes that fall within a selection range (inclusive of both ends).
 * Caller must pass `from` and `to` in document order; use normalizeRange first.
 */
export function getTextNodesBetween(
  doc: Document,
  from: NodePosition,
  to: NodePosition,
): Array<{ path: number[]; node: TextNode }> {
  const results: Array<{ path: number[]; node: TextNode }> = [];

  walkDocument(doc, (node, path) => {
    if (!isTextNode(node as EditorNode)) return;
    if (comparePaths(path, from.path) >= 0 && comparePaths(path, to.path) <= 0) {
      results.push({ path: [...path], node: node as TextNode });
    }
  });

  return results;
}
