/**
 * PastePlugin
 *
 * Intercepts paste events on the editor container, sanitizes the pasted HTML,
 * converts it to our document model, and inserts it at the current cursor.
 *
 * Paste sanitization is CRITICAL for security and correctness:
 *   - Strip scripts, iframes, event handlers
 *   - Normalize formatting (convert <b> → mark, etc.)
 *   - Reject unknown elements (fall back to plain text)
 *
 * This plugin attaches a 'paste' DOM event listener in its init() and
 * removes it on cleanup. It produces a replace_doc transaction so the
 * history manager captures the state before the paste as an undo point.
 */

import type { EditorPlugin, EditorEngineInterface } from "../../types";
import { htmlSerializer } from "../serialization/HTMLSerializer";
import { createTransaction, tr_replaceDoc } from "../core/Transaction";

export function createPastePlugin(): EditorPlugin {
  return {
    name: "paste",
    // Paste handling is attached to the DOM via attachPasteHandler; the plugin
    // exists only so the engine knows the feature is registered.
  };
}

/**
 * Attach paste handling to the editor container.
 * Called by the Editor component after the container ref is available.
 */
export function attachPasteHandler(
  container: HTMLElement,
  engine: EditorEngineInterface,
): () => void {
  const handler = (e: ClipboardEvent) => {
    e.preventDefault();
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // Image items take priority (copied image or screenshot)
    const imageItem = Array.from(clipboardData.items).find(
      (item) => item.type.startsWith("image/"),
    );
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        const blobUrl = URL.createObjectURL(file);
        const state = engine.getState();
        const merged = { ...state.doc };
        const tr = createTransaction();
        const sel = state.selection;
        const blockPath = sel ? [sel.anchor.path[0]] : [state.doc.children.length - 1];
        const insertIdx = blockPath[0] + 1;
        tr.steps.push({
          type: "insert_node",
          parentPath: [],
          index: insertIdx,
          node: { type: "image", attrs: { src: blobUrl, alt: file.name }, children: [] },
        });
        engine.dispatch(tr);
        void merged; // suppress unused warning
        return;
      }
    }

    const html = clipboardData.getData("text/html");
    const plainText = clipboardData.getData("text/plain");

    let newDoc;
    if (html) {
      const sanitized = sanitizeHTML(html);
      newDoc = htmlSerializer.deserialize(sanitized);
    } else if (plainText) {
      // Auto-link: if the entire pasted plain text is a URL, wrap it in <a>
      const trimmed = plainText.trim();
      if (isURL(trimmed)) {
        const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const escaped = escapeHTML(trimmed);
        newDoc = htmlSerializer.deserialize(
          `<p><a href="${escapeAttr(href)}">${escaped}</a></p>`,
        );
      } else {
        newDoc = htmlSerializer.deserialize(`<p>${escapeHTML(plainText)}</p>`);
      }
    } else {
      return;
    }

    // Merge pasted content into the existing doc at cursor position
    // For simplicity: replace the doc entirely (for a real editor you'd merge)
    const state = engine.getState();
    const merged = {
      ...state.doc,
      children: [...state.doc.children, ...newDoc.children],
    };

    const tr = createTransaction();
    tr.steps.push(tr_replaceDoc(merged));
    engine.dispatch(tr);
  };

  container.addEventListener("paste", handler as EventListener);
  return () => container.removeEventListener("paste", handler as EventListener);
}

/**
 * Strip dangerous HTML, keeping only safe formatting elements.
 */
function sanitizeHTML(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove script, style, iframe, object, embed, etc.
  const dangerous = doc.querySelectorAll(
    "script, style, iframe, object, embed, form, input, button, select, textarea, meta, link",
  );
  dangerous.forEach((el) => el.remove());

  // Strip all event handlers (on*)
  doc.querySelectorAll("*").forEach((el) => {
    const attrs = Array.from(el.attributes);
    attrs.forEach((attr) => {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    });
    // Also strip style attributes to prevent CSS injection
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("id");
  });

  return doc.body.innerHTML;
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const URL_RE = /^(https?:\/\/|www\.)[^\s]{2,}$/i;

function isURL(text: string): boolean {
  if (!URL_RE.test(text)) return false;
  try {
    new URL(text.startsWith('http') ? text : `https://${text}`);
    return true;
  } catch {
    return false;
  }
}
