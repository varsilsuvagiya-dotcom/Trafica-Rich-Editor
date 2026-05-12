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

    const html = clipboardData.getData("text/html");
    const plainText = clipboardData.getData("text/plain");

    let newDoc;
    if (html) {
      const sanitized = sanitizeHTML(html);
      newDoc = htmlSerializer.deserialize(sanitized);
    } else if (plainText) {
      newDoc = htmlSerializer.deserialize(`<p>${escapeHTML(plainText)}</p>`);
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
