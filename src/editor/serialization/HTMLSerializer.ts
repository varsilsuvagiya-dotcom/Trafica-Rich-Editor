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

import type { Document, BlockNode, TextNode, EditorNode, Mark, Serializer, AlignmentType } from '../../types';
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
    case 'paragraph': {
      const align = node.attrs?.align ? ` data-align="${node.attrs.align}"` : '';
      return `<p${align}>${serializeChildren(node.children)}</p>`;
    }
    case 'heading': {
      const l = node.attrs?.level ?? 1;
      const align = node.attrs?.align ? ` data-align="${node.attrs.align}"` : '';
      return `<h${l}${align}>${serializeChildren(node.children)}</h${l}>`;
    }
    case 'blockquote': {
      const align = node.attrs?.align ? ` data-align="${node.attrs.align}"` : '';
      return `<blockquote${align}>${serializeChildren(node.children)}</blockquote>`;
    }
    case 'bullet_list':
      return `<ul>${serializeChildren(node.children)}</ul>`;
    case 'ordered_list':
      return `<ol>${serializeChildren(node.children)}</ol>`;
    case 'list_item':
      return `<li>${serializeChildren(node.children)}</li>`;
    case 'check_list':
      return `<ul data-type="checklist">${serializeChildren(node.children)}</ul>`;
    case 'check_list_item': {
      const checked = node.attrs?.checked ? ' data-checked="true"' : '';
      return `<li${checked}>${serializeChildren(node.children)}</li>`;
    }
    case 'code_block': {
      const lang = node.attrs?.language ? ` class="language-${node.attrs.language}"` : '';
      const raw = node.children.map((c) => isTextNode(c) ? escapeHTML((c as TextNode).text) : '').join('');
      return `<pre><code${lang}>${raw}</code></pre>`;
    }
    case 'image': {
      const src = escapeAttr(node.attrs?.src as string ?? '');
      const alt = escapeAttr(node.attrs?.alt as string ?? '');
      const width = node.attrs?.width ? ` width="${node.attrs.width}"` : '';
      const align = node.attrs?.align ? ` data-align="${node.attrs.align}"` : '';
      const caption = node.attrs?.caption ? escapeHTML(node.attrs.caption as string) : '';
      if (caption) {
        return `<figure${align}><img src="${src}" alt="${alt}"${width} /><figcaption>${caption}</figcaption></figure>`;
      }
      return `<figure${align}><img src="${src}" alt="${alt}"${width} /></figure>`;
    }
    case 'horizontal_rule':
      return '<hr />';
    case 'table': {
      const rows = node.children.map((c) => serializeBlock(c as BlockNode)).join('');
      return `<table><tbody>${rows}</tbody></table>`;
    }
    case 'table_row': {
      const cells = node.children.map((c) => serializeBlock(c as BlockNode)).join('');
      return `<tr>${cells}</tr>`;
    }
    case 'table_cell': {
      if (node.attrs?.covered) return '';
      const cs = (node.attrs?.colspan as number) > 1 ? ` colspan="${node.attrs?.colspan}"` : '';
      const rs = (node.attrs?.rowspan as number) > 1 ? ` rowspan="${node.attrs?.rowspan}"` : '';
      return `<td${cs}${rs}>${serializeChildren(node.children)}</td>`;
    }
    case 'table_header': {
      if (node.attrs?.covered) return '';
      const cs = (node.attrs?.colspan as number) > 1 ? ` colspan="${node.attrs?.colspan}"` : '';
      const rs = (node.attrs?.rowspan as number) > 1 ? ` rowspan="${node.attrs?.rowspan}"` : '';
      return `<th${cs}${rs}>${serializeChildren(node.children)}</th>`;
    }
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
  const parts = node.text.split('\n');
  const serializedParts = parts.map((part) => {
    let text = escapeHTML(part);
    for (const mark of node.marks) {
      text = wrapWithMarkHTML(text, mark);
    }
    return text;
  });
  return serializedParts.join('<br>');
}

function wrapWithMarkHTML(text: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold': return `<strong>${text}</strong>`;
    case 'italic': return `<em>${text}</em>`;
    case 'underline': return `<u>${text}</u>`;
    case 'strikethrough': return `<s>${text}</s>`;
    case 'code': return `<code>${text}</code>`;
    case 'link': return `<a href="${escapeAttr(mark.attrs?.href as string ?? '#')}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    case 'highlight': return mark.attrs?.color
      ? `<mark style="background-color:${escapeAttr(mark.attrs.color as string)}">${text}</mark>`
      : `<mark>${text}</mark>`;
    case 'font_size': return `<span style="font-size:${escapeAttr(mark.attrs?.size as string ?? '')}">${text}</span>`;
    case 'font_family': return `<span style="font-family:${escapeAttr(mark.attrs?.family as string ?? '')}">${text}</span>`;
    case 'text_color': return `<span style="color:${escapeAttr(mark.attrs?.color as string ?? '')}">${text}</span>`;
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
    case 'div': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'paragraph', attrs: align ? { align } : {}, children: parseInlineChildren(el) };
    }
    case 'h1': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'heading', attrs: { level: 1, ...(align ? { align } : {}) }, children: parseInlineChildren(el) };
    }
    case 'h2': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'heading', attrs: { level: 2, ...(align ? { align } : {}) }, children: parseInlineChildren(el) };
    }
    case 'h3': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'heading', attrs: { level: 3, ...(align ? { align } : {}) }, children: parseInlineChildren(el) };
    }
    case 'h4': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'heading', attrs: { level: 4, ...(align ? { align } : {}) }, children: parseInlineChildren(el) };
    }
    case 'h5': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'heading', attrs: { level: 5, ...(align ? { align } : {}) }, children: parseInlineChildren(el) };
    }
    case 'h6': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'heading', attrs: { level: 6, ...(align ? { align } : {}) }, children: parseInlineChildren(el) };
    }
    case 'blockquote': {
      const align = el.getAttribute('data-align') as AlignmentType | null;
      return { type: 'blockquote', attrs: align ? { align } : {}, children: parseInlineChildren(el) };
    }
    case 'ul': {
      if (el.getAttribute('data-type') === 'checklist') {
        const items: BlockNode[] = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'li').map((li) => ({
          type: 'check_list_item' as const,
          attrs: { checked: li.getAttribute('data-checked') === 'true' },
          children: parseInlineChildren(li as HTMLElement),
        }));
        return { type: 'check_list', attrs: {}, children: items };
      }
      const items: BlockNode[] = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'li').map((li) => ({
        type: 'list_item' as const,
        attrs: {},
        children: parseListItemChildren(li as HTMLElement, 'bullet_list'),
      }));
      return { type: 'bullet_list', attrs: {}, children: items };
    }
    case 'ol': {
      const items: BlockNode[] = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'li').map((li) => ({
        type: 'list_item' as const,
        attrs: {},
        children: parseListItemChildren(li as HTMLElement, 'ordered_list'),
      }));
      return { type: 'ordered_list', attrs: {}, children: items };
    }
    case 'pre': {
      const codeEl = el.querySelector('code');
      const lang = codeEl?.className.match(/language-(\S+)/)?.[1] ?? '';
      const text = codeEl?.textContent ?? el.textContent ?? '';
      return {
        type: 'code_block',
        attrs: lang ? { language: lang } : {},
        children: [{ type: 'text', text, marks: [] }],
      };
    }
    case 'figure': {
      const img = el.querySelector('img');
      const caption = el.querySelector('figcaption')?.textContent ?? '';
      const align = el.getAttribute('data-align') ?? '';
      if (img) {
        return {
          type: 'image',
          attrs: {
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt') ?? '',
            ...(img.getAttribute('width') ? { width: parseFloat(img.getAttribute('width')!) } : {}),
            ...(align ? { align: align as AlignmentType } : {}),
            ...(caption ? { caption } : {}),
          },
          children: [],
        };
      }
      return null;
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
      return null;
    case 'table': {
      const tbody = el.querySelector('tbody') ?? el;
      const rows: BlockNode[] = Array.from(tbody.children)
        .filter(c => c.tagName.toLowerCase() === 'tr')
        .map((tr) => {
          const cells: BlockNode[] = Array.from(tr.children)
            .filter(c => c.tagName.toLowerCase() === 'td' || c.tagName.toLowerCase() === 'th')
            .map((cell) => ({
              type: (cell.tagName.toLowerCase() === 'th' ? 'table_header' : 'table_cell') as 'table_header' | 'table_cell',
              attrs: {
                colspan: parseInt(cell.getAttribute('colspan') ?? '1'),
                rowspan: parseInt(cell.getAttribute('rowspan') ?? '1'),
                covered: false,
              },
              // table_cell children must be block nodes (paragraphs)
              children: [{ type: 'paragraph' as const, attrs: {}, children: parseInlineChildren(cell as HTMLElement) }],
            }));
          return { type: 'table_row' as const, attrs: {}, children: cells };
        });
      return { type: 'table', attrs: { colWidths: rows[0]?.children.map(() => 120) ?? [] }, children: rows };
    }
    default: {
      // Unknown element: extract its text and make a paragraph
      const text = el.textContent ?? '';
      if (!text.trim()) return null;
      return createParagraph(text.trim());
    }
  }
}

function parseListItemChildren(li: HTMLElement, _listType: 'bullet_list' | 'ordered_list'): EditorNode[] {
  const children: EditorNode[] = [];
  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        const nestedListType = tag === 'ul' ? 'bullet_list' : 'ordered_list';
        const items: BlockNode[] = Array.from((child as HTMLElement).children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map((nestedLi) => ({
            type: 'list_item' as const,
            attrs: {},
            children: parseListItemChildren(nestedLi as HTMLElement, nestedListType),
          }));
        children.push({ type: nestedListType, attrs: {}, children: items });
        continue;
      }
    }
  }

  const inlineNodes = parseInlineChildren(li);
  if (inlineNodes.length > 0 || children.length === 0) {
    return [...inlineNodes, ...children];
  }
  return children;
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

    if (tag === 'br') {
      results.push({ type: 'text', text: '\n', marks: [...marks] });
      return;
    }

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
    case 'mark': {
      const bg = el.style.backgroundColor;
      return [{ type: 'highlight', ...(bg ? { attrs: { color: bg } } : {}) }];
    }
    case 'span': {
      const marks: Mark[] = [];
      const style = el.getAttribute('style') ?? '';
      const fontSize = style.match(/font-size:\s*([^;]+)/)?.[1]?.trim();
      const fontFamily = style.match(/font-family:\s*([^;]+)/)?.[1]?.trim();
      const color = style.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1]?.trim();
      if (fontSize) marks.push({ type: 'font_size', attrs: { size: fontSize } });
      if (fontFamily) marks.push({ type: 'font_family', attrs: { family: fontFamily } });
      if (color) marks.push({ type: 'text_color', attrs: { color } });
      return marks;
    }
    default:
      return [];
  }
}
