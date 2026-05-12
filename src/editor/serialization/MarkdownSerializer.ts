/**
 * MarkdownSerializer
 *
 * Converts the document model to Markdown.
 * Deserialization is intentionally basic — use an HTML-first paste flow for
 * rich Markdown imports (convert MD→HTML, then HTML→model).
 */

import type { Document, BlockNode, TextNode, EditorNode, Mark, Serializer } from '../../types';
import { isTextNode, createParagraph } from '../core/DocumentModel';
import { htmlSerializer } from './HTMLSerializer';

export const markdownSerializer: Serializer<string> = {
  serialize(doc: Document): string {
    return doc.children.map((block) => serializeMDBlock(block, 0)).join('\n\n');
  },

  deserialize(markdown: string): Document {
    // Simple MD→HTML→model pipeline
    const html = markdownToHTML(markdown);
    return htmlSerializer.deserialize(html);
  },
};

function serializeMDBlock(node: BlockNode, depth: number): string {
  switch (node.type) {
    case 'paragraph':
      return serializeMDInline(node.children);

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${serializeMDInline(node.children)}`;
    }

    case 'blockquote':
      return serializeMDInline(node.children)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

    case 'bullet_list':
      return node.children
        .map((child) => {
          const text = serializeMDBlock(child as BlockNode, depth + 1);
          return `${'  '.repeat(depth)}- ${text}`;
        })
        .join('\n');

    case 'ordered_list':
      return node.children
        .map((child, i) => {
          const text = serializeMDBlock(child as BlockNode, depth + 1);
          return `${'  '.repeat(depth)}${i + 1}. ${text}`;
        })
        .join('\n');

    case 'list_item':
      return serializeMDInline(node.children);

    case 'code_block': {
      const lang = (node.attrs?.language as string) ?? '';
      const text = node.children
        .filter((c) => isTextNode(c))
        .map((c) => (c as TextNode).text)
        .join('');
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }

    case 'image':
      return `![${node.attrs?.alt ?? ''}](${node.attrs?.src ?? ''})`;

    case 'horizontal_rule':
      return '---';

    default:
      return serializeMDInline(node.children);
  }
}

function serializeMDInline(children: EditorNode[]): string {
  return children
    .map((child) => {
      if (!isTextNode(child)) return serializeMDBlock(child as BlockNode, 0);
      return serializeMDText(child as TextNode);
    })
    .join('');
}

function serializeMDText(node: TextNode): string {
  let text = node.text;

  for (const mark of node.marks) {
    text = wrapWithMDMark(text, mark);
  }

  return text;
}

function wrapWithMDMark(text: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold': return `**${text}**`;
    case 'italic': return `*${text}*`;
    case 'underline': return `<u>${text}</u>`; // MD has no underline
    case 'strikethrough': return `~~${text}~~`;
    case 'code': return `\`${text}\``;
    case 'link': return `[${text}](${mark.attrs?.href ?? '#'})`;
    case 'highlight': return `==${text}==`; // extended MD
    default: return text;
  }
}

// ─── Basic Markdown → HTML ────────────────────────────────────────────────────

function markdownToHTML(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLang = '';

  for (const line of lines) {
    // Code fences
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeContent = [];
      } else {
        const langAttr = codeLang ? ` class="language-${codeLang}"` : '';
        result.push(`<pre><code${langAttr}>${escapeHTML(codeContent.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      result.push(`<h${level}>${inlineMarkdownToHTML(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      result.push('<hr />');
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push(`<blockquote>${inlineMarkdownToHTML(line.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*+]\s+(.*)/);
    if (ulMatch) {
      result.push(`<ul><li>${inlineMarkdownToHTML(ulMatch[1])}</li></ul>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      result.push(`<ol><li>${inlineMarkdownToHTML(olMatch[1])}</li></ol>`);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      continue;
    }

    // Regular paragraph
    result.push(`<p>${inlineMarkdownToHTML(line)}</p>`);
  }

  return result.join('');
}

function inlineMarkdownToHTML(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>');
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
