# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (Next.js 16, port 3000)
npm run build    # production build
npm run lint     # ESLint
```

No test suite is configured.

## Architecture

This is a **from-scratch rich text editor** built on Next.js 16 / React 19. It uses **no external editor framework** (no ProseMirror, Slate, Quill, etc.). The entire editor engine lives in `src/editor/`.

### Data flow (unidirectional)

```
User action → Command → Transaction → engine.dispatch()
  → applyTransaction() → new EditorState
  → subscribers notified → React re-render
  → DOMRenderer rebuilds DOM from model
  → SelectionEngine restores cursor
```

The DOM is **never the source of truth**. It is always derived from `EditorState`.

### Core model (`src/types/index.ts`)

```
Document { type: 'doc', children: BlockNode[] }
  BlockNode { type, attrs, children: EditorNode[] }
    TextNode { type: 'text', text: string, marks: Mark[] }
```

Marks (bold, italic, underline, strikethrough, code, link, highlight, font_size, font_family, text_color) are stored on `TextNode.marks`. Marks with attrs (link `href`, highlight `color`, font_size `size`, font_family `family`, text_color `color`) are compared including attrs by `marksEqual` so adjacent nodes with different values are never incorrectly merged. Block types: paragraph, heading, blockquote, bullet_list, ordered_list, list_item, check_list, check_list_item, code_block, image, hard_break, horizontal_rule, table, table_row, table_cell, table_header. `check_list_item` has a `checked: boolean` attr; `check_list` is a container (like `bullet_list`) and is listed in `isContainerBlock` so `findContentBlockPath` skips it correctly. Table nodes: `table` holds `colWidths: number[]` in attrs; `table_cell`/`table_header` hold `colspan`, `rowspan`, `covered` (boolean — covered cells are model-present but DOM-absent). Table types are in `isContainerBlock` so `findContentBlockPath` skips them and Enter/Backspace work correctly inside cell paragraphs.

`EditorState` has four fields: `doc`, `selection`, `marks` (pending marks for next typed char), `version`.

### Key files

| File | Role |
|------|------|
| `src/editor/core/EditorEngine.ts` | Singleton controller — owns state, plugins, subscriber list. Only `dispatch()` mutates state. |
| `src/editor/core/Transaction.ts` | `applyTransaction()` — pure function that applies a step list to produce a new `EditorState`. All step types handled here. |
| `src/editor/core/DocumentModel.ts` | Immutable tree operations (`insertTextAtPath`, `addMarkToNode`, `getTextNodesBetween`, `getDocumentMarkAttrValues`, etc.). No side effects. |
| `src/editor/selection/SelectionEngine.ts` | Bridges browser Selection API ↔ model `(path, offset)` pairs. `captureSelection` reads DOM, `restoreSelection` writes DOM after re-render. |
| `src/editor/rendering/DOMRenderer.ts` | `renderDocument()` — wipes and rebuilds the `contentEditable` container from the model. Every text node span gets `data-path` for selection mapping. |
| `src/editor/commands/index.ts` | Pure command functions `(engine) → boolean`. Only place that calls `engine.dispatch()`. Includes `toggleMark`, `setBlockType`, `handleEnter`, `handleBackspace`, keyboard plugin. |
| `src/editor/table/TableModel.ts` | Pure immutable table-tree operations: `createTableNode`, row/column insert/delete, `mergeTableCells`, `splitTableCell`, `findTablePath`, `findCellPosition`, `getCellFirstPosition`. |
| `src/editor/table/TableCommands.ts` | Table commands: `insertTable`, `addRowAbove/Below`, `deleteRow`, `addColumnLeft/Right`, `deleteColumn`, `mergeCells`, `splitCell`, `deleteTable`, `setColumnWidth`. Table mutations use `delete_node` + `insert_node` to replace the whole table atomically. |
| `src/editor/table/TablePlugin.ts` | `EditorPlugin` — Tab/Shift+Tab cell navigation; Tab on last cell appends a new row. Registered in `useEditorEngine`. |
| `src/editor/history/HistoryManager.ts` | Undo/redo via state snapshots (not inverse steps). Implemented as an `EditorPlugin`. |
| `src/editor/plugins/PastePlugin.ts` | Paste handler — sanitizes HTML, deserializes to model, merges into doc. |
| `src/editor/serialization/` | `HTMLSerializer`, `JSONSerializer`, `MarkdownSerializer` — serialize/deserialize the document model. |
| `src/components/Editor.tsx` | React wrapper — owns the `contentEditable` div, wires `onBeforeInput`, `onKeyDown`, `onFocus`, `onMouseDown`, click, and paste handlers. Uses `useLayoutEffect` (not `useEffect`) for DOM sync + cursor restore. `onMouseDown` intercepts clicks on `[data-check-path]` inputs to toggle `check_list_item`, clicks on `[data-image-path]` to select images, and mousedown on resize handles for column/image resize. Accepts optional `onUploadImage?: (file: File) => Promise<string>` prop for custom upload. |
| `src/components/toolbar/Toolbar.tsx` | Reads `state.marks` for collapsed-cursor active state; reads `getActiveMarks()` for range selections. Hosts `FontFamilyDropdown`, `FontSizeDropdown`, `AlignmentDropdown`, `BackgroundColorDropdown`, `TextColorDropdown`. |
| `src/components/toolbar/FontFamilyDropdown.tsx` | Font family picker — 9 predefined stacks + custom input. Stores full CSS font-family string in mark attrs. |
| `src/components/toolbar/FontSizeDropdown.tsx` | Font size picker — sizes 8–48 px. Stores `'12px'` format in mark attrs. |
| `src/components/toolbar/AlignmentDropdown.tsx` | Alignment picker — Left/Center/Right/Justify. Sets `align` on the containing block's attrs. |
| `src/components/toolbar/TableButton.tsx` | Toolbar button with CKEditor-style 10×10 grid-selector popup. Hover highlights the selection; click calls `insertTable(rows, cols)`. |
| `src/components/toolbar/HorizontalRuleButton.tsx` | Toolbar button that calls `insertHorizontalRule` — inserts a `horizontal_rule` node + trailing empty paragraph and moves cursor after the rule. |
| `src/components/toolbar/ChecklistButton.tsx` | Toolbar button for `toggleCheckList` (Ctrl+Shift+9). Active when cursor is inside a `check_list_item`. |
| `src/components/toolbar/BackgroundColorDropdown.tsx` | Split-button background/highlight color picker — quick-apply last color + dropdown with 15-color preset grid (5×3), "Document colors" for non-preset highlight colors in doc, native `<input type="color">` picker, remove option. Writes `highlight` mark via `setHighlightColor`. |
| `src/components/toolbar/TextColorDropdown.tsx` | Split-button text color picker — 15-color preset grid (5×3), "Document colors" for non-preset colors used in doc, native `<input type="color">` picker, remove option. |
| `src/editor/search/SearchEngine.ts` | `findMatches()` — walks doc model to collect `SearchMatch[]`. `applySearchHighlights()` / `clearSearchHighlights()` — CSS Custom Highlight API (Chrome 105+, FF 117+, Safari 17.2+), highlights survive full re-renders. `scrollMatchIntoView()` — scrolls a match's `data-path` span into view. |
| `src/editor/search/SearchCommands.ts` | `replaceMatch(match, replacement)` — dispatches delete_text + insert_text for one match. `replaceAllMatches(matches, replacement)` — processes all matches last-to-first in one transaction so earlier offsets stay valid. |
| `src/components/toolbar/TableToolbar.tsx` | Floating fixed-position toolbar that appears above the table whenever the cursor is inside a table cell. Buttons: toggle header row, insert/delete row, insert/delete column, merge/split cells, delete table. Rendered from `Editor.tsx` when `findCellPosition` returns non-null. |
| `src/components/toolbar/ImageUploadButton.tsx` | Toolbar button that opens a dropdown with two tabs: "Upload file" (drag-drop zone + file picker → blob URL or custom `onUploadImage` upload with progress bar) and "Insert URL" (manual URL + live preview). Calls `insertImage` on confirm. |
| `src/components/toolbar/ImageToolbar.tsx` | Floating fixed-position toolbar shown when an image is selected (click). Buttons: align left/center/right, add/edit/remove caption (inline popover), delete image. Uses `setImageAttr` and `deleteImageAtPath`. |
| `src/components/TableContextMenu.tsx` | Right-click context menu for table operations (row/column CRUD, merge, split, delete table). Rendered at fixed viewport position; closes on outside click/Escape/scroll. |
| `src/components/FindReplaceModal.tsx` | Floating find & replace dialog (fixed top-right). Subscribes to engine state to recompute matches on doc change. Applies highlights via `useEffect` (after Editor's `useLayoutEffect` re-renders DOM). Ctrl+F / Ctrl+H open it from `Editor.tsx`; Escape closes. |
| `src/hooks/useEditorEngine.ts` | Creates engine + registers history and keyboard plugins via `useMemo`. |
| `src/hooks/useEditorState.ts` | `useSyncExternalStore` integration — triggers React re-renders on engine state changes. |
| `src/editor/editor.css` | Editor visual styles (imported by `EditorPage`). Block elements use `editor-*` class names set by `DOMRenderer`. |

### Plugin system

Plugins implement `EditorPlugin` (optional `init`, `onTransaction`, `onStateChange`, `keyBindings`). Registered via `engine.registerPlugin()`. The history manager and default keyboard bindings are the two built-in plugins.

### Pending marks (`state.marks`)

When the cursor is **collapsed** (no text selected), `state.marks` holds marks that will be applied to the next typed character. `toggleMark` stores/removes marks here when `selection.isCollapsed`. `applyTransaction`'s `set_selection` case re-initializes `state.marks` from the text node at the new cursor position so the toolbar always reflects the current context. Commands like `setFontSize`, `setFontFamily`, and `setHighlightColor` also write to `tr.meta.pendingMarks` on collapsed selections.

### `set_mark` step (atomic mark replacement)

The `set_mark` step type (handled by `setMarkOnRange` in DocumentModel) atomically removes any existing mark of a given type and inserts the new value in one `mutateMarksInRange` pass. This avoids the path-shift bug that occurs when a `remove_mark` + `add_mark` pair is used in sequence. Use `tr_setMark(from, to, markType, mark | null)` from Transaction. Used by `setFontSize`, `setFontFamily`, `setHighlightColor`.

### Selection path format

Positions are `{ path: number[], offset: number }`. `path=[0]` is the first block, `path=[0,1]` is the second text node inside the first block. `DOMRenderer` bakes `data-path` attributes on every text-node span and `data-block-path` on block elements so `SelectionEngine` can round-trip between DOM and model coordinates.
