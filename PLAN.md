# Rich Editor Audit & Remediation Plan

A full architectural audit of `src/editor/`, `src/components/`, and `src/hooks/`. Issues are ranked by impact on correctness, then UX. Each issue lists the root cause, the industry-standard fix, and the files to touch.

---

## P0 — CRITICAL (editor produces incorrect content)

### 1. Mark commands apply to entire text nodes, not selected character ranges
**Symptom:** Select "hel" inside "hello world", click **B** → the **whole** "hello world" text node becomes bold.
**Root cause:** [DocumentModel.ts](src/editor/core/DocumentModel.ts) `addMarkToNode`/`removeMarkFromNode` operate on the entire `TextNode` and ignore the `from.offset` / `to.offset` of the selection.
**Fix (industry standard — ProseMirror/Slate/Quill all do this):**
- Add `splitTextNodeAt(doc, path, offset)` that splits a `TextNode` into two adjacent text nodes preserving marks.
- In `applyTransaction` for `add_mark`/`remove_mark`:
  1. Normalize `from`/`to` so `from ≤ to` in document order.
  2. Split the text node at `to.offset` then at `from.offset` (do `to` first to keep `from.offset` valid).
  3. Apply the mark to every text node now strictly inside the `[from, to]` range.
  4. Merge adjacent text nodes with identical marks afterwards.
- After applying, restore selection across the (potentially now-different) paths.

### 2. Typing with a non-collapsed selection doesn't delete the selected text
**Symptom:** Highlight "hello", press any key → "hello" stays and a character appears next to it.
**Root cause:** [Editor.tsx](src/components/Editor.tsx) `handleBeforeInput` only inserts; never deletes.
**Fix:** Before insert, if `selection` is not collapsed, dispatch a `delete_range` step (or compose `delete_text` + `join_blocks` if it spans blocks), then insert.

### 3. Backspace ignores non-collapsed selection
**Symptom:** Highlight text, press Backspace → cursor moves left by one character, the highlighted text remains.
**Root cause:** [commands/index.ts](src/editor/commands/index.ts) `handleBackspace` exits early when `!selection.isCollapsed`.
**Fix:** When selection is a range, delete the range instead.

### 4. `splitBlock` (Enter key) destroys all marks
**Symptom:** Type bold text → press Enter → both halves become unmarked.
**Root cause:** [DocumentModel.ts](src/editor/core/DocumentModel.ts) `splitBlock` uses `collectText()` which returns a plain string, throwing away `marks`.
**Fix:** Walk the block's children, splitting the text node that contains `offset` while preserving its marks; move children with index ≥ split point to the new block.

### 5. `getEnclosingBlockPath` assumes paths are only one level deep
**Symptom:** Heading/blockquote/list commands break for content inside a list item. Cursor at `[0,1,0,2]` (text inside list_item inside bullet_list) resolves to `[0]` (the list itself), so changing block type changes the list, not the item.
**Root cause:** [commands/index.ts](src/editor/commands/index.ts) `getEnclosingBlockPath` returns `[path[0]]` unconditionally.
**Fix:** Walk the path from the leaf upward, returning the path of the deepest block node that is a direct content block (paragraph/heading/blockquote/list_item/code_block) — not a container (bullet_list/ordered_list/doc).

### 6. Cursor cannot be placed inside formatted text after re-render
**Symptom:** Cursor jumps to the start of the paragraph when clicking inside `<strong><em>text</em></strong>`.
**Root cause:** [SelectionEngine.ts](src/editor/selection/SelectionEngine.ts) `getTextNodeOf` only inspects **direct** child nodes of the span, but text nodes are nested inside mark wrappers (`<strong><em>#text</em></strong>`).
**Fix:** Recursively descend the first child chain until reaching a `Node.TEXT_NODE`.

### 7. `getActiveMarks` only inspects the anchor node
**Symptom:** Selecting bold + non-bold text shows the Bold button as active (or not) based purely on where the anchor landed, inconsistent with what the user sees.
**Root cause:** [SelectionEngine.ts](src/editor/selection/SelectionEngine.ts) `getActiveMarks` reads `selection.anchor.path` only.
**Fix:** For a range selection, return the **intersection** of marks across all text nodes inside the range. Industry standard: a button is "active" when every selected character has the mark.

---

## P1 — HIGH (correctness and stability)

### 8. `splitBlock` always creates a `paragraph` as the second block
For headings → paragraph is correct. For `list_item` → should be another `list_item`. Currently handled via a single ternary; needs an explicit rule table.

### 9. `joinBlocks` does not coalesce adjacent text nodes with identical marks
After repeated splits/joins/deletes, a single bolded run becomes many fragmented `TextNode`s. Fix: after `join_blocks`, walk the merged children and merge consecutive text nodes whose `marks` arrays are equal.

### 10. `getTextNodesBetween` uses `JSON.stringify(path)` equality
Fragile (any path-shape change breaks it) and `O(n·depth)` on each compare. Replace with `comparePaths(a, b): -1 | 0 | 1` and walk while `cmp(path, to) <= 0`.

### 11. `onBeforeInput` only handles `insertText`
Other `inputType`s the browser fires today: `deleteContentBackward`, `deleteContentForward`, `deleteWordBackward`, `insertParagraph`, `insertLineBreak`, `insertFromPaste`, `insertCompositionText`. Currently the browser is silently allowed to mutate the DOM for any unhandled type, which de-syncs the model from the DOM. **Fix:** Either preventDefault for all and route to commands, or whitelist only safe ones.

### 12. IME composition handling is incomplete
`isComposing` is checked but no `compositionstart`/`compositionend` listeners exist to suspend the controlled-render loop. On CJK/emoji input the model fights the IME.
**Fix:** Track `isComposingRef`; suspend `renderDocument` rebuilds while composing; on `compositionend`, take the final composed string and dispatch a single `insert_text`.

### 13. Full innerHTML wipe on every state change
[DOMRenderer.ts](src/editor/rendering/DOMRenderer.ts) `renderDocument` does `container.innerHTML = ''` then rebuilds. Side effects: flicker, IME loss, animation reset, slow on large docs, scroll position jumps.
**Fix:** Minimal — only rebuild for `replace_doc` / structural changes. For text/mark-only changes, diff at the block level (replace the changed `<p>` rather than the whole container). Long-term: a real reconciler.

### 14. History grows unbounded for typing
Every keystroke = one undo entry → 100 keystrokes fill the stack, undo only walks back letter by letter.
**Fix:** Coalesce consecutive `insert_text` transactions within a short time window (e.g. 500 ms) into one history entry. ProseMirror calls this "input chunking".

### 15. Selection-change loop guard is leaky
The `isRenderingRef` flag is flipped synchronously around `renderDocument`, but `selectionchange` is dispatched **asynchronously** by the browser, so the guard can be false when the late event arrives. Net effect: a stale captured selection can overwrite the freshly-set one.
**Fix:** Compare the captured selection to the engine's current selection (already done) but also gate on a version counter (skip if the DOM has changed since capture).

---

## P2 — MEDIUM (architectural smell, dead code)

### 16. `createPastePlugin` and `createHistoryPlugin` are dead code
[PastePlugin.ts](src/editor/plugins/PastePlugin.ts) `createPastePlugin` returns a plugin whose `init` stores an engine ref then does nothing — the actual paste handler is `attachPasteHandler` wired in [Editor.tsx](src/components/Editor.tsx). Similarly [HistoryManager.ts](src/editor/history/HistoryManager.ts) has both `createHistoryPlugin` (with a `findEngine` that always returns null) and `createHistoryManager`. **Fix:** delete the unused factories.

### 17. Paste replaces the whole document
[PastePlugin.ts](src/editor/plugins/PastePlugin.ts) does `tr_replaceDoc({...doc, children: [...old, ...pasted]})`. Should insert at cursor and respect selection (delete range, then insert).

### 18. Paste sanitization strips formatting that should be preserved
Currently strips `style`, `class`, **and** `id` from every element. Need to keep `href` on `<a>`, `src`/`alt` on `<img>`, and ideally normalize colors/sizes to known marks. Use a tag+attr whitelist instead of "remove this set of dangerous tags".

### 19. No strikethrough keyboard shortcut
`defaultKeyboardPlugin` binds Bold/Italic/Underline but not Strike. Industry default: `Ctrl+Shift+X`.

### 20. `console.log` left in production code
[Editor.tsx:295](src/components/Editor.tsx#L295) logs every keystroke. Remove.

### 21. Markdown serializer recomputed on every render
[EditorPage.tsx](src/components/EditorPage.tsx) calls `markdownSerializer.serialize(engine.getState().doc)` in the render body. Memoize on `state.doc`.

### 22. `useEditorEngine` swallows initialState changes
[useEditorEngine.ts](src/hooks/useEditorEngine.ts) has `// eslint-disable-next-line react-hooks/exhaustive-deps` and `useMemo(..., [])`. Acceptable for the singleton case but should be documented.

### 23. HeadingDropdown is CSS-only (`group-hover` / `group-focus-within`)
No proper menu role, no Esc-to-close, no keyboard arrow nav. Replace with a controlled `useState` + `aria-expanded` button.

### 24. `editor.css` uses `@media (prefers-color-scheme: dark)` while the rest uses Tailwind `dark:` classes
Inconsistent. Migrate the CSS file to Tailwind or convert the app to use prefers-color-scheme. Tailwind is the project standard.

---

## P3 — LOW (polish, nice-to-have)

- 25. Strip the unused `useState` import in PastePlugin (`createPastePlugin` factory).
- 26. Add unit tests for `DocumentModel` pure functions (split/join/insert/delete/setMark).
- 27. `getDocumentLength` walks the whole tree — fine for now but cache per state version if perf becomes a concern.
- 28. `selectAll` will crash if the last block has zero children (`lastChildren.length - 1` = -1).
- 29. The `<EditorPage />` "engine v1" chip and footer hint text are hard-coded strings — pull into constants if a settings panel is planned.

---

## Implementation Order

The plan below addresses P0 + P1 in a single pass since they are tightly coupled (mark range fix uses the same text-node-splitting machinery that fixes split/join, etc.).

**Phase A — Model layer** (`DocumentModel.ts`, `Transaction.ts`)
1. Add `comparePaths(a, b)` and `normalizeRange(from, to)`.
2. Add `splitTextNodeAt(doc, path, offset)` (splits a TextNode at a character offset, preserving marks).
3. Add `mergeAdjacentTextNodes(doc, blockPath)` (coalesces adjacent same-mark text nodes inside a block).
4. Add `deleteRange(doc, from, to)` (handles same-text-node, cross-text-node, and cross-block deletes).
5. Rewrite `addMarkToNode`/`removeMarkFromNode` to take a `from`/`to` range, splitting at boundaries.
6. Rewrite `splitBlock` to walk children, splitting the text node that contains `offset` while preserving marks. Use a block-type-mapping table to decide the second block's type (list_item → list_item, code_block → code_block, heading → paragraph, paragraph → paragraph, blockquote → paragraph).
7. Rewrite `joinBlocks` to merge children and call `mergeAdjacentTextNodes` afterwards.
8. Rewrite `getTextNodesBetween` to use `comparePaths`.

**Phase B — Commands** (`commands/index.ts`)
9. Rewrite `getEnclosingBlockPath` to walk up to the deepest *content* block (not container).
10. Rewrite `handleBackspace` to delete the selection range when non-collapsed.
11. Add `replaceSelectionWithText(text)` command used by `handleBeforeInput`.
12. Add `Ctrl+Shift+x` for strikethrough.
13. Remove `console.log`.

**Phase C — Selection** (`SelectionEngine.ts`)
14. Fix `getTextNodeOf` to recurse into mark wrappers.
15. Rewrite `getActiveMarks` to return intersection of marks across the selection range.
16. Add `comparePositions` for normalizing anchor/focus order.

**Phase D — Editor wiring** (`Editor.tsx`)
17. `handleBeforeInput`: handle the full `inputType` set we care about (`insertText`, `insertParagraph`, `insertLineBreak`, `deleteContentBackward`, `deleteContentForward`, `deleteWordBackward`); prevent default for everything else and ignore.
18. Add `compositionstart` / `compositionend` handlers; suspend rebuilds while composing.
19. After mark/delete operations that change paths, dispatch a `set_selection` with the new resolved position.
20. Memoize the markdown serializer call in EditorPage.

**Phase E — Cleanup**
21. Delete `createHistoryPlugin` and `createPastePlugin` (dead).
22. Replace `JSON.stringify(selection)` comparisons with structural equality helper.
23. Audit and remove other dead code.

---

## Out of scope for this pass

- Diffing renderer (P1 #13) — non-trivial; revisit once correctness is locked in.
- Tests — recommended but a separate task.
- HeadingDropdown keyboard a11y — recommended but separate.
- Tailwind/CSS unification — separate.
- Input chunking for history — separate.
