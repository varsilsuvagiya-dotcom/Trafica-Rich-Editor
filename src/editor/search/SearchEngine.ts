/**
 * SearchEngine
 *
 * Pure functions for finding text matches in the document model
 * and applying visual highlights via the CSS Custom Highlight API.
 *
 * CSS Custom Highlight API (Chrome 105+, Firefox 117+, Safari 17.2+)
 * highlights text without modifying the DOM structure, so they survive
 * the DOMRenderer's full re-render cycle.
 */

import type { Document, EditorNode, TextNode } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchMatch {
  path: number[];
  startOffset: number;
  endOffset: number;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

// ─── Match Finding ────────────────────────────────────────────────────────────

export function findMatches(
  doc: Document,
  query: string,
  opts: SearchOptions,
): SearchMatch[] {
  if (!query) return [];
  const matches: SearchMatch[] = [];
  walkNode(doc as unknown as { children?: EditorNode[] }, [], query, opts, matches);
  return matches;
}

function walkNode(
  node: { children?: EditorNode[]; type?: string; text?: string },
  path: number[],
  query: string,
  opts: SearchOptions,
  out: SearchMatch[],
): void {
  if (node.type === 'text') {
    findInText((node as unknown as TextNode).text, path, query, opts, out);
    return;
  }
  const children = node.children;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    walkNode(
      children[i] as unknown as { children?: EditorNode[]; type?: string; text?: string },
      [...path, i],
      query,
      opts,
      out,
    );
  }
}

function findInText(
  text: string,
  path: number[],
  query: string,
  opts: SearchOptions,
  out: SearchMatch[],
): void {
  const haystack = opts.caseSensitive ? text : text.toLowerCase();
  const needle   = opts.caseSensitive ? query : query.toLowerCase();

  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;

    if (!opts.wholeWord || isWholeWord(text, idx, idx + needle.length)) {
      out.push({ path: [...path], startOffset: idx, endOffset: idx + needle.length });
    }
    pos = idx + needle.length; // non-overlapping
  }
}

function isWholeWord(text: string, start: number, end: number): boolean {
  const w = /\w/;
  if (start > 0 && w.test(text[start - 1])) return false;
  if (end < text.length && w.test(text[end])) return false;
  return true;
}

// ─── CSS Custom Highlight API ─────────────────────────────────────────────────

const HL_ALL     = 'editor-search';
const HL_CURRENT = 'editor-search-current';

function getCSSHighlights(): Map<string, unknown> | null {
  if (typeof CSS === 'undefined') return null;
  return (CSS as unknown as { highlights?: Map<string, unknown> }).highlights ?? null;
}

function getHighlightCtor(): (new (...ranges: Range[]) => unknown) | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight ?? null;
}

export function applySearchHighlights(
  container: HTMLElement,
  matches: SearchMatch[],
  currentIndex: number,
): void {
  const cssHL = getCSSHighlights();
  const Hl    = getHighlightCtor();
  if (!cssHL || !Hl) return;

  cssHL.delete(HL_ALL);
  cssHL.delete(HL_CURRENT);

  if (matches.length === 0) return;

  const allRanges: Range[]     = [];
  const currentRanges: Range[] = [];

  for (let i = 0; i < matches.length; i++) {
    const range = matchToRange(container, matches[i]);
    if (!range) continue;
    (i === currentIndex ? currentRanges : allRanges).push(range);
  }

  if (allRanges.length)     cssHL.set(HL_ALL,     new Hl(...allRanges));
  if (currentRanges.length) cssHL.set(HL_CURRENT, new Hl(...currentRanges));
}

export function clearSearchHighlights(): void {
  const cssHL = getCSSHighlights();
  if (!cssHL) return;
  cssHL.delete(HL_ALL);
  cssHL.delete(HL_CURRENT);
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function matchToRange(container: HTMLElement, match: SearchMatch): Range | null {
  const el = container.querySelector(`[data-path='${JSON.stringify(match.path)}']`);
  if (!el) return null;

  const textNode = findLeafText(el);
  if (!textNode || match.endOffset > textNode.length) return null;

  try {
    const range = document.createRange();
    range.setStart(textNode, match.startOffset);
    range.setEnd(textNode,   match.endOffset);
    return range;
  } catch {
    return null;
  }
}

function findLeafText(el: Element): Text | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

export function scrollMatchIntoView(container: HTMLElement, match: SearchMatch): void {
  const el = container.querySelector(`[data-path='${JSON.stringify(match.path)}']`);
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
