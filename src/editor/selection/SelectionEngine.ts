/**
 * SelectionEngine
 *
 * Bridges the browser's Selection/Range API to our internal EditorSelection
 * model. This is one of the hardest parts of building a custom editor.
 *
 * THE CORE PROBLEM:
 *   The browser's Selection gives you DOM nodes + character offsets.
 *   Our model uses (path, offset) pairs pointing into the document tree.
 *   We need to map reliably between the two — even after DOM re-renders.
 *
 * HOW CURSOR RESTORATION WORKS:
 *   1. Before re-render: call captureSelection() → save EditorSelection.
 *   2. Re-render DOM from new state.
 *   3. After re-render: call restoreSelection(editorSelection) → walk the
 *      new DOM using data-path attributes we baked in during rendering,
 *      find the corresponding text nodes, and use Range API to put the
 *      cursor back exactly where it was.
 *
 * WHY data-path?
 *   Each rendered DOM text node gets a data-path="[0,1,2]" attribute on its
 *   parent span/element. The SelectionEngine uses querySelectorAll to find
 *   the text node matching a given path without doing a full tree walk.
 */

import type { EditorSelection, NodePosition, Document, EditorNode, TextNode, MarkType, Mark } from '../../types';
import {
  isTextNode,
  getNodeAtPath,
  comparePaths,
  normalizeRange,
  getTextNodesBetween,
} from '../core/DocumentModel';

// ─── DOM → Model ──────────────────────────────────────────────────────────────

/**
 * Read the browser's current Selection and convert it to an EditorSelection.
 * Returns null if there's no valid selection inside the editor container.
 */
export function captureSelection(container: HTMLElement): EditorSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);

  // Bail if the selection is completely outside our editor
  if (!container.contains(range.commonAncestorContainer)) return null;

  const anchor = domPointToNodePosition(range.startContainer, range.startOffset, container);
  const focus = domPointToNodePosition(range.endContainer, range.endOffset, container);

  if (!anchor || !focus) return null;

  return {
    anchor,
    focus,
    isCollapsed: range.collapsed,
  };
}

/**
 * Convert a (domNode, offset) pair to a (path, offset) NodePosition.
 * Walks up the DOM looking for data-path (text node span) first,
 * then falls back to data-block-path (the block element itself).
 * This handles the case of clicking inside an empty paragraph that has no
 * text children yet — the path will point to the block, and insertTextAtPath
 * knows how to create a text node there.
 */
function domPointToNodePosition(
  node: Node,
  offset: number,
  container: HTMLElement,
): NodePosition | null {
  let el: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  let blockPathFallback: NodePosition | null = null;

  while (el && el !== container) {
    const elem = el as HTMLElement;

    if (elem.dataset?.path) {
      try {
        const path = JSON.parse(elem.dataset.path) as number[];
        return { path, offset };
      } catch {
        // malformed
      }
    }

    // Remember the nearest block path as a fallback
    if (!blockPathFallback && elem.dataset?.blockPath) {
      try {
        const path = JSON.parse(elem.dataset.blockPath) as number[];
        blockPathFallback = { path, offset: 0 };
      } catch {
        // malformed
      }
    }

    el = elem.parentElement;
  }

  return blockPathFallback ?? { path: [0], offset: 0 };
}

// ─── Model → DOM ──────────────────────────────────────────────────────────────

/**
 * Restore the browser's selection from an EditorSelection.
 * Must be called after the DOM has been re-rendered.
 *
 * Strategy:
 *   Find the DOM element with data-path matching anchor.path,
 *   then set the Range on its text node with the correct offset.
 */
export function restoreSelection(
  container: HTMLElement,
  selection: EditorSelection,
): void {
  if (!selection) return;

  // Try text-node path first; fall back to block-path for block-level selections
  // (e.g. an empty paragraph whose path is [0] — it has data-block-path but no data-path).
  // If neither exists (e.g. selection pointed at [1,0] but the new block at [1] is empty),
  // walk the path up until we find a block element to anchor on.
  const anchorEl = resolveSelectionElement(container, selection.anchor.path);
  const focusEl = resolveSelectionElement(container, selection.focus.path);

  if (!anchorEl || !focusEl) return;

  const anchorText = getTextNodeOf(anchorEl);
  const focusText = getTextNodeOf(focusEl);

  try {
    const range = document.createRange();

    if (anchorText) {
      range.setStart(anchorText, Math.min(selection.anchor.offset, anchorText.length));
    } else {
      // Empty block (only a <br> inside) — place cursor at start of the element
      range.setStart(anchorEl, 0);
    }

    if (focusText) {
      range.setEnd(focusText, Math.min(selection.focus.offset, focusText.length));
    } else {
      range.setEnd(focusEl, 0);
    }

    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch {
    // DOM may have changed between capture and restore; silently fail
  }
}

/**
 * Resolve a model path to a DOM element for selection restoration.
 *
 * Tries the exact text-node path first (data-path), then the exact block path
 * (data-block-path), and finally walks the path upward stripping the last
 * index — this handles the case where the model points at a child that doesn't
 * exist yet in the DOM (e.g. Enter at the end of a paragraph creates an empty
 * block; selection points at [1,0] but only data-block-path='[1]' exists).
 */
function resolveSelectionElement(container: HTMLElement, path: number[]): HTMLElement | null {
  for (let depth = path.length; depth >= 0; depth--) {
    const candidate = path.slice(0, depth);
    const pathStr = JSON.stringify(candidate);
    const el =
      container.querySelector<HTMLElement>(`[data-path='${pathStr}']`) ??
      container.querySelector<HTMLElement>(`[data-block-path='${pathStr}']`);
    if (el) return el;
  }
  return null;
}

/**
 * Find the first descendant Text node inside an element. Recurses through mark
 * wrappers (<strong>, <em>, <u>, <s>, <code>, <a>, <mark>) since text nodes are
 * nested inside them. Returns null only for truly empty elements.
 */
function getTextNodeOf(el: HTMLElement): Text | null {
  let cur: Node | null = el;
  while (cur) {
    const first: Node | null = cur.firstChild;
    if (!first) return null;
    if (first.nodeType === Node.TEXT_NODE) return first as Text;
    cur = first;
  }
  return null;
}

// ─── Mark detection ───────────────────────────────────────────────────────────

/**
 * Given an EditorSelection, determine which marks are active.
 * Used by the toolbar to highlight active format buttons.
 *
 * Collapsed cursor → marks of the text node at the cursor.
 * Range            → marks present on EVERY text node fully inside the range
 *                    (industry standard: button is "on" iff all selected chars
 *                    carry the mark).
 */
export function getActiveMarks(
  doc: Document,
  selection: EditorSelection | null,
): Set<MarkType> {
  if (!selection) return new Set();

  if (selection.isCollapsed) {
    const node = getNodeAtPath(doc, selection.anchor.path);
    if (!node || !isTextNode(node as EditorNode)) return new Set();
    return new Set((node as TextNode).marks.map((m) => m.type));
  }

  const { from, to } = normalizeRange(selection.anchor, selection.focus);
  const nodes = getTextNodesBetween(doc, from, to);
  if (nodes.length === 0) return new Set();

  // Skip nodes that don't actually overlap the range (boundary nodes whose
  // selected slice is empty).
  const overlapping = nodes.filter(({ path, node }) => {
    if (comparePaths(path, from.path) === 0 && from.offset >= node.text.length) return false;
    if (comparePaths(path, to.path) === 0 && to.offset <= 0) return false;
    return true;
  });
  if (overlapping.length === 0) return new Set();

  // Intersect the marks across every overlapping text node.
  const initial = new Set(overlapping[0].node.marks.map((m) => m.type));
  for (let i = 1; i < overlapping.length; i++) {
    const here = new Set(overlapping[i].node.marks.map((m) => m.type));
    for (const m of initial) {
      if (!here.has(m)) initial.delete(m);
    }
    if (initial.size === 0) break;
  }
  return initial;
}

/**
 * Get the block node type at the current selection anchor.
 * Used by toolbar to highlight the active block type button.
 */
export function getActiveBlockType(
  doc: Document,
  selection: EditorSelection | null,
): string {
  if (!selection) return 'paragraph';

  // Walk up from the anchor path to find the first block node
  const path = selection.anchor.path;
  for (let depth = path.length; depth >= 0; depth--) {
    const node = getNodeAtPath(doc, path.slice(0, depth));
    if (node && !isTextNode(node as EditorNode) && (node as EditorNode).type !== 'doc') {
      const type = (node as EditorNode).type;
      if (type === 'heading') {
        const level = ((node as import('../../types').BlockNode).attrs?.level as number) ?? 1;
        return `heading-${level}`;
      }
      return type;
    }
  }
  return 'paragraph';
}

/**
 * Return the text alignment of the content block at the cursor, or 'left'.
 */
export function getActiveAlignment(
  doc: Document,
  selection: EditorSelection | null,
): import('../../types').AlignmentType {
  if (!selection) return 'left';
  const path = selection.anchor.path;
  for (let depth = path.length; depth >= 1; depth--) {
    const node = getNodeAtPath(doc, path.slice(0, depth));
    if (node && !isTextNode(node as EditorNode) && (node as EditorNode).type !== 'doc') {
      return ((node as import('../../types').BlockNode).attrs?.align as import('../../types').AlignmentType) ?? 'left';
    }
  }
  return 'left';
}

/**
 * Return the href of the link mark at the current cursor/selection, or null.
 * For a collapsed cursor: checks the text node at the cursor position.
 * For a range: checks the anchor text node.
 * Also checks pendingMarks so the toolbar reflects a just-toggled link.
 */
export function getActiveLinkHref(
  doc: Document,
  selection: EditorSelection | null,
  pendingMarks: Mark[],
): string | null {
  if (!selection) return null;

  const findHref = (marks: Mark[]): string | null => {
    const lm = marks.find((m) => m.type === 'link');
    return lm ? (lm.attrs?.href as string) ?? null : null;
  };

  if (selection.isCollapsed) {
    const fromPending = findHref(pendingMarks);
    if (fromPending) return fromPending;
    const node = getNodeAtPath(doc, selection.anchor.path);
    if (node && isTextNode(node as EditorNode)) return findHref((node as TextNode).marks);
    return null;
  }

  const node = getNodeAtPath(doc, selection.anchor.path);
  if (node && isTextNode(node as EditorNode)) return findHref((node as TextNode).marks);
  return null;
}

/**
 * Return the text_color mark value at the current cursor/selection, or null.
 * Collapsed cursor: checks pending marks then the text node at the cursor.
 * Range: returns the color only if every selected text node shares the same one.
 */
export function getActiveTextColor(
  doc: Document,
  selection: EditorSelection | null,
  pendingMarks: Mark[],
): string | null {
  if (!selection) return null;

  if (selection.isCollapsed) {
    const fromPending = pendingMarks.find((m) => m.type === 'text_color');
    if (fromPending) return (fromPending.attrs?.color as string) ?? null;
    const node = getNodeAtPath(doc, selection.anchor.path);
    if (node && isTextNode(node as EditorNode)) {
      const cm = (node as TextNode).marks.find((m) => m.type === 'text_color');
      return cm ? (cm.attrs?.color as string) ?? null : null;
    }
    return null;
  }

  const { from, to } = normalizeRange(selection.anchor, selection.focus);
  const nodes = getTextNodesBetween(doc, from, to);
  if (nodes.length === 0) return null;

  let color: string | null | undefined = undefined;
  for (const { node } of nodes) {
    const cm = node.marks.find((m) => m.type === 'text_color');
    const nodeColor = cm ? (cm.attrs?.color as string) ?? null : null;
    if (color === undefined) {
      color = nodeColor;
    } else if (color !== nodeColor) {
      return null; // mixed colors — show nothing active
    }
  }
  return color ?? null;
}

/**
 * Return the highlight color at the current cursor/selection, or null.
 * Collapsed cursor: checks pending marks then the text node at the cursor.
 * Range: returns the color only if every selected text node shares the same one.
 */
export function getActiveHighlightColor(
  doc: Document,
  selection: EditorSelection | null,
  pendingMarks: Mark[],
): string | null {
  if (!selection) return null;

  if (selection.isCollapsed) {
    const fromPending = pendingMarks.find((m) => m.type === 'highlight');
    if (fromPending) return (fromPending.attrs?.color as string) ?? null;
    const node = getNodeAtPath(doc, selection.anchor.path);
    if (node && isTextNode(node as EditorNode)) {
      const hm = (node as TextNode).marks.find((m) => m.type === 'highlight');
      return hm ? (hm.attrs?.color as string) ?? null : null;
    }
    return null;
  }

  const { from, to } = normalizeRange(selection.anchor, selection.focus);
  const nodes = getTextNodesBetween(doc, from, to);
  if (nodes.length === 0) return null;

  let color: string | null | undefined = undefined;
  for (const { node } of nodes) {
    const hm = node.marks.find((m) => m.type === 'highlight');
    const nodeColor = hm ? (hm.attrs?.color as string) ?? null : null;
    if (color === undefined) {
      color = nodeColor;
    } else if (color !== nodeColor) {
      return null; // mixed colors — show nothing active
    }
  }
  return color ?? null;
}

/**
 * Return the font_family mark value at the current cursor/selection, or null.
 * Collapsed cursor: checks pending marks then the text node at the cursor.
 * Range: returns the family only if every selected text node shares the same one.
 */
/**
 * Return the full model range that a link mark occupies starting from the cursor.
 *
 * Walks the block's text-node siblings in both directions from the anchor node,
 * collecting all consecutive nodes that carry the same link href. Returns
 * {from, to, href} so commands can operate on the whole link span — not just
 * the node the cursor happens to sit in.
 *
 * Returns null when the cursor is not on any link mark.
 */
export function getActiveLinkRange(
  doc: Document,
  selection: EditorSelection | null,
): { from: NodePosition; to: NodePosition; href: string } | null {
  if (!selection) return null;

  const anchorPath = selection.anchor.path;
  const node = getNodeAtPath(doc, anchorPath);
  if (!node || !isTextNode(node as EditorNode)) return null;

  const anchorNode = node as TextNode;
  const linkMark = anchorNode.marks.find((m) => m.type === 'link');
  if (!linkMark) return null;

  const href = (linkMark.attrs?.href as string) ?? '';

  // Walk sibling text nodes in the same parent block
  const parentPath = anchorPath.slice(0, -1);
  const parent = getNodeAtPath(doc, parentPath);
  if (!parent || isTextNode(parent as EditorNode)) return null;

  const siblings = (parent as import('../../types').BlockNode).children;
  const anchorIdx = anchorPath[anchorPath.length - 1];

  // Expand left: include preceding siblings with the same link href
  let startIdx = anchorIdx;
  while (startIdx > 0) {
    const prev = siblings[startIdx - 1];
    if (!prev || !isTextNode(prev as EditorNode)) break;
    const prevLink = (prev as TextNode).marks.find((m) => m.type === 'link');
    if (!prevLink || (prevLink.attrs?.href as string) !== href) break;
    startIdx--;
  }

  // Expand right: include following siblings with the same link href
  let endIdx = anchorIdx;
  while (endIdx < siblings.length - 1) {
    const next = siblings[endIdx + 1];
    if (!next || !isTextNode(next as EditorNode)) break;
    const nextLink = (next as TextNode).marks.find((m) => m.type === 'link');
    if (!nextLink || (nextLink.attrs?.href as string) !== href) break;
    endIdx++;
  }

  const startNode = siblings[startIdx] as TextNode;
  const endNode = siblings[endIdx] as TextNode;

  return {
    from: makePosition([...parentPath, startIdx], 0),
    to: makePosition([...parentPath, endIdx], endNode.text.length),
    href,
  };
}

export function getActiveFontFamily(
  doc: Document,
  selection: EditorSelection | null,
  pendingMarks: Mark[],
): string | null {
  if (!selection) return null;

  if (selection.isCollapsed) {
    const fromPending = pendingMarks.find((m) => m.type === 'font_family');
    if (fromPending) return (fromPending.attrs?.family as string) ?? null;
    const node = getNodeAtPath(doc, selection.anchor.path);
    if (node && isTextNode(node as EditorNode)) {
      const fm = (node as TextNode).marks.find((m) => m.type === 'font_family');
      return fm ? (fm.attrs?.family as string) ?? null : null;
    }
    return null;
  }

  const { from, to } = normalizeRange(selection.anchor, selection.focus);
  const nodes = getTextNodesBetween(doc, from, to);
  if (nodes.length === 0) return null;

  let family: string | null | undefined = undefined;
  for (const { node } of nodes) {
    const fm = node.marks.find((m) => m.type === 'font_family');
    const nodeFamily = fm ? (fm.attrs?.family as string) ?? null : null;
    if (family === undefined) {
      family = nodeFamily;
    } else if (family !== nodeFamily) {
      return null; // mixed families — show nothing
    }
  }
  return family ?? null;
}

/**
 * Return the font_size mark value at the current cursor/selection, or null.
 * Collapsed cursor: checks pending marks then the text node at the cursor.
 * Range: returns the size only if every selected text node shares the same size.
 */
export function getActiveFontSize(
  doc: Document,
  selection: EditorSelection | null,
  pendingMarks: Mark[],
): string | null {
  if (!selection) return null;

  if (selection.isCollapsed) {
    const fromPending = pendingMarks.find((m) => m.type === 'font_size');
    if (fromPending) return (fromPending.attrs?.size as string) ?? null;
    const node = getNodeAtPath(doc, selection.anchor.path);
    if (node && isTextNode(node as EditorNode)) {
      const fm = (node as TextNode).marks.find((m) => m.type === 'font_size');
      return fm ? (fm.attrs?.size as string) ?? null : null;
    }
    return null;
  }

  const { from, to } = normalizeRange(selection.anchor, selection.focus);
  const nodes = getTextNodesBetween(doc, from, to);
  if (nodes.length === 0) return null;

  let size: string | null | undefined = undefined;
  for (const { node } of nodes) {
    const fm = node.marks.find((m) => m.type === 'font_size');
    const nodeSize = fm ? (fm.attrs?.size as string) ?? null : null;
    if (size === undefined) {
      size = nodeSize;
    } else if (size !== nodeSize) {
      return null; // mixed sizes — show nothing
    }
  }
  return size ?? null;
}

/**
 * Collapse the current browser selection to the end of the range.
 */
export function collapseSelectionToEnd(_container: HTMLElement): void {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    sel.collapseToEnd();
  }
}

/**
 * Returns true if the current browser selection is inside the given container.
 */
export function isSelectionInContainer(container: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  return container.contains(range.commonAncestorContainer);
}

/**
 * Build a NodePosition from a path and offset.
 */
export function makePosition(path: number[], offset: number): NodePosition {
  return { path, offset };
}

/**
 * Build a collapsed EditorSelection at a given position.
 */
export function makeCollapsedSelection(position: NodePosition): EditorSelection {
  return {
    anchor: position,
    focus: position,
    isCollapsed: true,
  };
}
