/**
 * DOMRenderer
 *
 * Converts our document model into DOM elements and keeps them in sync.
 *
 * Architecture:
 *   renderDocument(doc, container) → wipes container, rebuilds DOM from scratch.
 *
 * Why rebuild instead of diff?
 *   For this engine we use "controlled full render" — similar to how React
 *   worked before the virtual DOM. For a production editor with very large
 *   documents you would layer a diffing reconciler on top. For our purposes
 *   the controlled render + cursor restoration pattern is correct and fast
 *   enough for documents up to ~50,000 characters.
 *
 * The KEY contract of this renderer:
 *   Every rendered element that corresponds to a TextNode gets:
 *     data-path="[0,1,2]"   ← the path to that node in the document tree
 *   This is what SelectionEngine uses to map between DOM and model positions.
 *
 * Marks map to HTML elements:
 *   bold        → <strong>
 *   italic      → <em>
 *   underline   → <u>
 *   strikethrough → <s>
 *   code        → <code>
 *   link        → <a href="...">
 *   highlight   → <mark>
 *
 * Block nodes map to:
 *   paragraph   → <p>
 *   heading     → <h1>...<h6>
 *   blockquote  → <blockquote>
 *   bullet_list → <ul>
 *   ordered_list→ <ol>
 *   list_item   → <li>
 *   code_block  → <pre><code>
 *   image       → <img>
 *   hard_break  → <br>
 */

import type {
  Document,
  EditorNode,
  BlockNode,
  TextNode,
  Mark,
} from '../../types';

import { isTextNode, isBlockNode } from '../core/DocumentModel';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render the entire document into the container element.
 * Clears existing content and rebuilds from the model.
 */
export function renderDocument(doc: Document, container: HTMLElement): void {
  container.innerHTML = '';
  for (let i = 0; i < doc.children.length; i++) {
    const blockEl = renderBlock(doc.children[i], [i]);
    container.appendChild(blockEl);
  }
}

// ─── Block Rendering ──────────────────────────────────────────────────────────

function renderBlock(node: BlockNode, path: number[]): HTMLElement {
  switch (node.type) {
    case 'paragraph':
      return renderParagraph(node, path);
    case 'heading':
      return renderHeading(node, path);
    case 'blockquote':
      return renderBlockquote(node, path);
    case 'bullet_list':
      return renderList(node, path, 'ul');
    case 'ordered_list':
      return renderList(node, path, 'ol');
    case 'list_item':
      return renderListItem(node, path);
    case 'code_block':
      return renderCodeBlock(node, path);
    case 'image':
      return renderImage(node, path);
    case 'hard_break':
      return renderHardBreak();
    case 'check_list':
      return renderCheckList(node, path);
    case 'check_list_item':
      return renderCheckListItem(node, path);
    case 'horizontal_rule':
      return renderHorizontalRule();
    case 'table':
      return renderTable(node, path);
    case 'table_row':
      return renderTableRow(node, path);
    case 'table_cell':
      return renderTableCell(node, path);
    case 'table_header':
      return renderTableHeader(node, path);
    default:
      return renderParagraph(node, path);
  }
}

// ─── Alignment ────────────────────────────────────────────────────────────────

function alignClass(node: BlockNode): string {
  const align = node.attrs?.align as string | undefined;
  return align && align !== 'left' ? ` editor-align-${align}` : '';
}

function renderParagraph(node: BlockNode, path: number[]): HTMLElement {
  const el = document.createElement('p');
  el.dataset.blockPath = JSON.stringify(path);
  el.className = `editor-paragraph${alignClass(node)}`;
  renderChildren(node, path, el);
  if (el.innerHTML === '') {
    // Ensure empty paragraphs are clickable / show a cursor
    el.appendChild(document.createElement('br'));
  }
  return el;
}

function renderHeading(node: BlockNode, path: number[]): HTMLElement {
  const level = (node.attrs?.level as number) ?? 1;
  const el = document.createElement(`h${level}`) as HTMLElement;
  el.dataset.blockPath = JSON.stringify(path);
  el.className = `editor-heading editor-heading-${level}${alignClass(node)}`;
  renderChildren(node, path, el);
  if (el.innerHTML === '') el.appendChild(document.createElement('br'));
  return el;
}

function renderBlockquote(node: BlockNode, path: number[]): HTMLElement {
  const el = document.createElement('blockquote');
  el.dataset.blockPath = JSON.stringify(path);
  el.className = `editor-blockquote${alignClass(node)}`;
  renderChildren(node, path, el);
  return el;
}

function renderList(node: BlockNode, path: number[], tag: 'ul' | 'ol'): HTMLElement {
  const el = document.createElement(tag);
  el.dataset.blockPath = JSON.stringify(path);
  el.className = tag === 'ul' ? 'editor-bullet-list' : 'editor-ordered-list';

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childPath = [...path, i];
    if (isBlockNode(child)) {
      const li = renderBlock(child as BlockNode, childPath);
      el.appendChild(li);
    }
  }

  if (el.children.length === 0) {
    // Empty list: add a placeholder li
    const li = document.createElement('li');
    li.appendChild(document.createElement('br'));
    el.appendChild(li);
  }

  return el;
}

function renderListItem(node: BlockNode, path: number[]): HTMLElement {
  const el = document.createElement('li');
  el.dataset.blockPath = JSON.stringify(path);
  el.className = `editor-list-item${alignClass(node)}`;
  renderChildren(node, path, el);
  if (el.innerHTML === '') el.appendChild(document.createElement('br'));
  return el;
}

function renderCodeBlock(node: BlockNode, path: number[]): HTMLElement {
  const pre = document.createElement('pre');
  pre.dataset.blockPath = JSON.stringify(path);
  pre.className = 'editor-code-block';

  const code = document.createElement('code');
  const lang = node.attrs?.language as string | undefined;
  if (lang) code.className = `language-${lang}`;

  renderChildren(node, path, code);
  if (code.innerHTML === '') code.appendChild(document.createElement('br'));

  pre.appendChild(code);
  return pre;
}

function renderImage(node: BlockNode, path: number[]): HTMLElement {
  const wrapper = document.createElement('figure');
  wrapper.dataset.blockPath = JSON.stringify(path);
  wrapper.dataset.imagePath = JSON.stringify(path);
  wrapper.contentEditable = 'false';

  const align = node.attrs?.align as string | undefined;
  wrapper.className = [
    'editor-image-wrapper',
    align === 'center' ? 'editor-image-center' : '',
    align === 'right'  ? 'editor-image-right'  : '',
    align === 'left'   ? 'editor-image-left'   : '',
  ].filter(Boolean).join(' ');

  const img = document.createElement('img');
  img.src = (node.attrs?.src as string) ?? '';
  img.alt = (node.attrs?.alt as string) ?? '';
  img.className = 'editor-image';
  img.draggable = false;
  if (node.attrs?.width) (img as HTMLImageElement).style.width = `${node.attrs.width as number}px`;

  wrapper.appendChild(img);

  // Caption
  const caption = node.attrs?.caption as string | undefined;
  if (caption !== undefined) {
    const figcaption = document.createElement('figcaption');
    figcaption.className = 'editor-image-caption';
    figcaption.textContent = caption;
    wrapper.appendChild(figcaption);
  }

  // Resize handles (corners) — shown only when wrapper[data-selected]
  for (const pos of ['nw', 'ne', 'sw', 'se'] as const) {
    const handle = document.createElement('div');
    handle.className = `editor-image-resize-handle editor-image-resize-${pos}`;
    handle.contentEditable = 'false';
    handle.dataset.resizeImagePath = JSON.stringify(path);
    handle.dataset.resizeImagePos = pos;
    wrapper.appendChild(handle);
  }

  return wrapper;
}

function renderHardBreak(): HTMLElement {
  const span = document.createElement('span');
  span.appendChild(document.createElement('br'));
  return span;
}

function renderCheckList(node: BlockNode, path: number[]): HTMLElement {
  const ul = document.createElement('ul');
  ul.dataset.blockPath = JSON.stringify(path);
  ul.className = 'editor-check-list';

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childPath = [...path, i];
    if (isBlockNode(child)) {
      ul.appendChild(renderBlock(child as BlockNode, childPath));
    }
  }

  if (ul.children.length === 0) {
    const li = document.createElement('li');
    li.appendChild(document.createElement('br'));
    ul.appendChild(li);
  }

  return ul;
}

function renderCheckListItem(node: BlockNode, path: number[]): HTMLElement {
  const li = document.createElement('li');
  li.dataset.blockPath = JSON.stringify(path);
  const isChecked = !!node.attrs?.checked;
  li.className = `editor-check-list-item${isChecked ? ' editor-check-list-item--checked' : ''}`;

  // Checkbox — contentEditable=false keeps it outside the editable flow
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isChecked;
  checkbox.contentEditable = 'false';
  checkbox.tabIndex = -1;
  checkbox.className = 'editor-checkbox';
  checkbox.dataset.checkPath = JSON.stringify(path);
  li.appendChild(checkbox);

  // Text content area
  const content = document.createElement('span');
  content.className = 'editor-check-list-content';
  renderChildren(node, path, content);
  if (content.innerHTML === '') content.appendChild(document.createElement('br'));
  li.appendChild(content);

  return li;
}

function renderHorizontalRule(): HTMLElement {
  const el = document.createElement('hr');
  el.className = 'editor-hr';
  el.contentEditable = 'false';
  return el;
}

// ─── Table Rendering ──────────────────────────────────────────────────────────

function renderTable(node: BlockNode, path: number[]): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.dataset.blockPath = JSON.stringify(path);
  wrapper.className = 'editor-table-wrapper';

  const colWidths = (node.attrs?.colWidths as number[]) ?? [];

  const table = document.createElement('table');
  table.className = 'editor-table';

  // <colgroup> drives column widths with table-layout:fixed
  // Use percentages so table always fits within its 100% container
  if (colWidths.length > 0) {
    const total = colWidths.reduce((s, w) => s + w, 0) || colWidths.length * 120;
    const colgroup = document.createElement('colgroup');
    for (let i = 0; i < colWidths.length; i++) {
      const col = document.createElement('col');
      col.style.width = `${((colWidths[i] / total) * 100).toFixed(4)}%`;
      col.dataset.colIndex = String(i);
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
  }

  const tbody = document.createElement('tbody');
  for (let r = 0; r < node.children.length; r++) {
    const row = node.children[r] as BlockNode;
    tbody.appendChild(renderTableRow(row, [...path, r], colWidths));
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function renderTableRow(
  node: BlockNode,
  path: number[],
  _colWidths?: number[],
): HTMLElement {
  const tr = document.createElement('tr');
  tr.dataset.blockPath = JSON.stringify(path);
  tr.className = 'editor-table-row';

  for (let c = 0; c < node.children.length; c++) {
    const cell = node.children[c] as BlockNode;
    const covered = cell.attrs?.covered as boolean | undefined;
    if (covered) continue; // spanning ancestor covers this slot — omit from DOM
    const cellEl = cell.type === 'table_header'
      ? renderTableHeader(cell, [...path, c])
      : renderTableCell(cell, [...path, c]);
    tr.appendChild(cellEl);
  }
  return tr;
}

function renderTableCellBase(
  tag: 'td' | 'th',
  node: BlockNode,
  path: number[],
): HTMLElement {
  const el = document.createElement(tag);
  el.dataset.blockPath = JSON.stringify(path);
  el.className = tag === 'th' ? 'editor-table-header-cell' : 'editor-table-cell';

  const colspan = (node.attrs?.colspan as number) ?? 1;
  const rowspan = (node.attrs?.rowspan as number) ?? 1;
  if (colspan > 1) el.colSpan = colspan;
  if (rowspan > 1) el.rowSpan = rowspan;

  // data attrs for cell-selection and resize tracking
  const row = path[path.length - 2];
  const col = path[path.length - 1];
  const tablePath = path.slice(0, -2);
  el.dataset.cellRow = String(row);
  el.dataset.cellCol = String(col);
  el.dataset.cellTablePath = JSON.stringify(tablePath);

  renderChildren(node, path, el);
  if (el.innerHTML === '') el.appendChild(document.createElement('br'));

  // Resize handle — contentEditable=false so it doesn't capture caret
  const handle = document.createElement('div');
  handle.className = 'editor-col-resize-handle';
  handle.contentEditable = 'false';
  handle.dataset.resizeTable = JSON.stringify(tablePath);
  handle.dataset.resizeCol = String(col);
  el.appendChild(handle);

  return el;
}

function renderTableCell(node: BlockNode, path: number[]): HTMLElement {
  return renderTableCellBase('td', node, path);
}

function renderTableHeader(node: BlockNode, path: number[]): HTMLElement {
  return renderTableCellBase('th', node, path);
}

// ─── Children / Inline Rendering ──────────────────────────────────────────────

function renderChildren(node: BlockNode, path: number[], container: HTMLElement): void {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childPath = [...path, i];

    if (isTextNode(child)) {
      const textEl = renderTextNode(child as TextNode, childPath);
      container.appendChild(textEl);
    } else if (isBlockNode(child)) {
      const blockEl = renderBlock(child as BlockNode, childPath);
      container.appendChild(blockEl);
    }
  }
}

/**
 * Render a TextNode into a <span> with nested mark elements.
 * The span gets data-path so the SelectionEngine can find it.
 *
 * Mark nesting: bold+italic → <strong><em>text</em></strong>
 */
function renderTextNode(node: TextNode, path: number[]): HTMLElement {
  const span = document.createElement('span');
  span.dataset.path = JSON.stringify(path);
  span.className = 'editor-text';

  // Build the mark-wrapped text node
  const textNode = document.createTextNode(node.text);
  const wrapped = wrapWithMarks(textNode, node.marks);
  span.appendChild(wrapped);

  return span;
}

/**
 * Wrap a DOM node with the given marks (innermost first).
 */
function wrapWithMarks(inner: Node, marks: Mark[]): Node {
  let current: Node = inner;
  for (const mark of [...marks].reverse()) {
    const wrapper = createMarkElement(mark);
    wrapper.appendChild(current);
    current = wrapper;
  }
  return current;
}

function createMarkElement(mark: Mark): HTMLElement {
  switch (mark.type) {
    case 'bold':
      return document.createElement('strong');
    case 'italic':
      return document.createElement('em');
    case 'underline': {
      const u = document.createElement('u');
      return u;
    }
    case 'strikethrough':
      return document.createElement('s');
    case 'code': {
      const code = document.createElement('code');
      code.className = 'editor-inline-code';
      return code;
    }
    case 'link': {
      const a = document.createElement('a');
      a.href = (mark.attrs?.href as string) ?? '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'editor-link';
      return a;
    }
    case 'highlight': {
      const mark_ = document.createElement('mark');
      if (mark.attrs?.color) {
        (mark_ as HTMLElement).style.backgroundColor = mark.attrs.color as string;
      }
      return mark_;
    }
    case 'font_size': {
      const span = document.createElement('span');
      if (mark.attrs?.size) span.style.fontSize = mark.attrs.size as string;
      return span;
    }
    case 'font_family': {
      const span = document.createElement('span');
      if (mark.attrs?.family) span.style.fontFamily = mark.attrs.family as string;
      return span;
    }
    case 'text_color': {
      const span = document.createElement('span');
      if (mark.attrs?.color) span.style.color = mark.attrs.color as string;
      return span;
    }
    default:
      return document.createElement('span');
  }
}
