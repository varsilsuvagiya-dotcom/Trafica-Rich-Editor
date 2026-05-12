/**
 * HTMLSerializer
 *
 * Converts the document model to/from HTML strings.
 * serialize() → HTML string for storage or copy-paste.
 * deserialize() → Document model from a pasted HTML string.
 *
 * Paste sanitization: we whitelist only the HTML elements we understand.
 * Any unknown element is converted to its text content, stripping the tag.
 */

import type { Document, BlockNode, TextNode, EditorNode, Mark, Serializer } from '../../types';
import { isTextNode, createParagraph, createEmptyDocument } from '../core/DocumentModel';

// ─── Serialize: Model → HTML ──────────────────────────────────────────────────

export const htmlSerializer: Serializer<string> = {
  serialize(doc: Document): string {
    return doc.children.map(serializeBlock).join('');
  },

  deserialize(html: string): Document {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, 'text/html');
    return parseHTMLBody(parsed.body);
  },
};

function serializeBlock(node: BlockNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${serializeChildren(node.children)}</p>`;
    case 'heading': {
      const l = node.attrs?.level ?? 1;
      return `<h${l}>${serializeChildren(node.children)}</h${l}>`;
    }
    case 'blockquote':
      return `<blockquote>${serializeChildren(node.children)}</blockquote>`;
    case 'bullet_list':
      return `<ul>${serializeChildren(node.children)}</ul>`;
    case 'ordered_list':
      return `<ol>${serializeChildren(node.children)}</ol>`;
    case 'list_item':
      return `<li>${serializeChildren(node.children)}</li>`;
    case 'code_block': {
      const lang = node.attrs?.language ? ` class="language-${node.attrs.language}"` : '';
      return `<pre><code${lang}>${serializeChildren(node.children)}</code></pre>`;
    }
    case 'image':
      return `<figure><img src="${escapeAttr(node.attrs?.src as string ?? '')}" alt="${escapeAttr(node.attrs?.alt as string ?? '')}" /></figure>`;
    case 'horizontal_rule':
      return '<hr />';
    default:
      return `<p>${serializeChildren(node.children)}</p>`;
  }
}

function serializeChildren(children: EditorNode[]): string {
  return children.map((child) => {
    if (isTextNode(child)) return serializeTextNode(child as TextNode);
    return serializeBlock(child as BlockNode);
  }).join('');
}

function serializeTextNode(node: TextNode): string {
  let text = escapeHTML(node.text);
  for (const mark of node.marks) {
    text = wrapWithMarkHTML(text, mark);
  }
  return text;
}

function wrapWithMarkHTML(text: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold': return `<strong>${text}</strong>`;
    case 'italic': return `<em>${text}</em>`;
    case 'underline': return `<u>${text}</u>`;
    case 'strikethrough': return `<s>${text}</s>`;
    case 'code': return `<code>${text}</code>`;
    case 'link': return `<a href="${escapeAttr(mark.attrs?.href as string ?? '#')}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    case 'highlight': return `<mark>${text}</mark>`;
    default: return text;
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Deserialize: HTML → Model ────────────────────────────────────────────────

function parseHTMLBody(body: HTMLElement): Document {
  const children: BlockNode[] = [];

  for (const child of Array.from(body.childNodes)) {
    const block = parseHTMLNode(child);
    if (block) children.push(block);
  }

  return { type: 'doc', children: children.length > 0 ? children : [createParagraph()] };
}

function parseHTMLNode(node: Node): BlockNode | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').trim();
    if (!text) return null;
    return createParagraph(text);
  }

  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();

  switch (tag) {
    case 'p':
    case 'div':
      return { type: 'paragraph', attrs: {}, children: parseInlineChildren(el) };
    case 'h1':
      return { type: 'heading', attrs: { level: 1 }, children: parseInlineChildren(el) };
    case 'h2':
      return { type: 'heading', attrs: { level: 2 }, children: parseInlineChildren(el) };
    case 'h3':
      return { type: 'heading', attrs: { level: 3 }, children: parseInlineChildren(el) };
    case 'h4':
      return { type: 'heading', attrs: { level: 4 }, children: parseInlineChildren(el) };
    case 'h5':
      return { type: 'heading', attrs: { level: 5 }, children: parseInlineChildren(el) };
    case 'h6':
      return { type: 'heading', attrs: { level: 6 }, children: parseInlineChildren(el) };
    case 'blockquote':
      return { type: 'blockquote', attrs: {}, children: parseInlineChildren(el) };
    case 'ul': {
      const items: BlockNode[] = Array.from(el.querySelectorAll('li')).map((li) => ({
        type: 'list_item' as const,
        attrs: {},
        children: parseInlineChildren(li),
      }));
      return { type: 'bullet_list', attrs: {}, children: items };
    }
    case 'ol': {
      const items: BlockNode[] = Array.from(el.querySelectorAll('li')).map((li) => ({
        type: 'list_item' as const,
        attrs: {},
        children: parseInlineChildren(li),
      }));
      return { type: 'ordered_list', attrs: {}, children: items };
    }
    case 'pre': {
      const codeEl = el.querySelector('code');
      const text = codeEl?.textContent ?? el.textContent ?? '';
      return {
        type: 'code_block',
        attrs: {},
        children: [{ type: 'text', text, marks: [] }],
      };
    }
    case 'img':
      return {
        type: 'image',
        attrs: { src: el.getAttribute('src') ?? '', alt: el.getAttribute('alt') ?? '' },
        children: [],
      };
    case 'hr':
      return { type: 'horizontal_rule', attrs: {}, children: [] };
    case 'br':
      return null; // handled as <br> in renderer
    default: {
      // Unknown element: extract its text and make a paragraph
      const text = el.textContent ?? '';
      if (!text.trim()) return null;
      return createParagraph(text.trim());
    }
  }
}

function parseInlineChildren(el: HTMLElement): TextNode[] {
  const results: TextNode[] = [];

  function walk(node: Node, marks: Mark[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) results.push({ type: 'text', text, marks: [...marks] });
      return;
    }

    const elem = node as HTMLElement;
    const tag = elem.tagName?.toLowerCase();
    const newMarks = [...marks, ...getMarksForTag(tag, elem)];

    for (const child of Array.from(elem.childNodes)) {
      walk(child, newMarks);
    }
  }

  walk(el, []);
  return results;
}

function getMarksForTag(tag: string, el: HTMLElement): Mark[] {
  switch (tag) {
    case 'strong':
    case 'b':
      return [{ type: 'bold' }];
    case 'em':
    case 'i':
      return [{ type: 'italic' }];
    case 'u':
      return [{ type: 'underline' }];
    case 's':
    case 'del':
    case 'strike':
      return [{ type: 'strikethrough' }];
    case 'code':
      return [{ type: 'code' }];
    case 'a':
      return [{ type: 'link', attrs: { href: el.getAttribute('href') ?? '#' } }];
    case 'mark':
      return [{ type: 'highlight' }];
    default:
      return [];
  }
}
