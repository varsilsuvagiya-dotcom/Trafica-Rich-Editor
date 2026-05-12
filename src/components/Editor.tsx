'use client';

import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
} from 'react';

import type { EditorEngine } from '../editor/core/EditorEngine';
import type { EditorState } from '../types';

import { useEditorState } from '../hooks/useEditorState';

import { renderDocument } from '../editor/rendering/DOMRenderer';

import {
  captureSelection,
  restoreSelection,
  isSelectionInContainer,
  makeCollapsedSelection,
} from '../editor/selection/SelectionEngine';

import { attachPasteHandler } from '../editor/plugins/PastePlugin';

import {
  createTransaction,
  tr_setSelection,
} from '../editor/core/Transaction';

import {
  handleEnter,
  handleBackspace,
  insertText,
  toggleCheckItemAt,
} from '../editor/commands';

import { Toolbar } from './toolbar/Toolbar';
import { FindReplaceModal } from './FindReplaceModal';
import { TableContextMenu } from './TableContextMenu';
import { getNodeAtPath } from '../editor/core/DocumentModel';
import { setColumnWidth } from '../editor/table/TableCommands';
import type { BlockNode } from '../types';

import { htmlSerializer } from '../editor/serialization/HTMLSerializer';
import { jsonSerializer } from '../editor/serialization/JSONSerializer';

import { insertImage } from '../editor/commands';

interface EditorProps {
  engine: EditorEngine;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  onHTMLChange?: (html: string) => void;
  onJSONChange?: (json: string) => void;
}

export function Editor({
  engine,
  placeholder = 'Start writing...',
  className = '',
  readOnly = false,
  onHTMLChange,
  onJSONChange,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const isRenderingRef = useRef(false);
  const isComposingRef = useRef(false);

  const stateRef = useRef<EditorState>(engine.getState());

  const [showImageDialog,   setShowImageDialog]   = useState(false);
  const [imageURL,          setImageURL]           = useState('');
  const [findReplaceOpen,   setFindReplaceOpen]    = useState(false);
  const [findReplaceMode,   setFindReplaceMode]    = useState<'find' | 'replace'>('find');

  // ── Table state ─────────────────────────────────────────────────────────────
  const [tableContextMenu, setTableContextMenu] = useState<{
    x: number; y: number;
    tablePath: number[]; row: number; col: number; isMerged: boolean;
  } | null>(null);

  const [tableSelection, setTableSelection] = useState<{
    tablePath: number[];
    anchorCell: [number, number];
    focusCell: [number, number];
  } | null>(null);

  // Tracks an active cell-range drag (mousedown on a td → mousemove across cells)
  const cellDragRef = useRef<{
    tablePath: number[]; startRow: number; startCol: number;
  } | null>(null);

  // Tracks an active column resize drag
  const colResizeRef = useRef<{
    tablePath: number[]; colIndex: number;
    startX: number; startWidth: number;
  } | null>(null);

  const state = useEditorState(engine);

  /*
   * Keep latest state in ref
   */
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  /*
   * INITIAL RENDER + DOM SYNC
   *
   * IMPORTANT:
   * - useLayoutEffect instead of useEffect
   * - no requestAnimationFrame
   * - restore selection synchronously
   * - depend only on state.doc
   */
  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    isRenderingRef.current = true;

    renderDocument(state.doc, container);

    // Focus the editor before restoring selection so the cursor is visible.
    // This is needed when focus was in a toolbar popover (e.g. link input).
    if (!container.contains(document.activeElement)) {
      container.focus({ preventScroll: true });
    }

    if (state.selection) {
      restoreSelection(container, state.selection);
    }

    isRenderingRef.current = false;

    if (onHTMLChange) {
      onHTMLChange(htmlSerializer.serialize(state.doc));
    }

    if (onJSONChange) {
      onJSONChange(jsonSerializer.serialize(state.doc));
    }
  }, [state.doc]);

  /*
   * Paste handler
   */
  useEffect(() => {
    const container = containerRef.current;

    if (!container || readOnly) return;

    return attachPasteHandler(container, engine);
  }, [engine, readOnly]);

  /*
   * Table cell-selection highlight — apply/remove CSS class on selected cells
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Clear previous highlights
    container.querySelectorAll('.editor-cell-selected').forEach((el) => {
      el.classList.remove('editor-cell-selected');
    });
    if (!tableSelection) return;
    const { tablePath, anchorCell, focusCell } = tableSelection;
    const minRow = Math.min(anchorCell[0], focusCell[0]);
    const maxRow = Math.max(anchorCell[0], focusCell[0]);
    const minCol = Math.min(anchorCell[1], focusCell[1]);
    const maxCol = Math.max(anchorCell[1], focusCell[1]);
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cellPath = [...tablePath, r, c];
        const td = container.querySelector(
          `[data-block-path="${JSON.stringify(cellPath)}"]`,
        ) as HTMLElement | null;
        if (td) td.classList.add('editor-cell-selected');
      }
    }
  }, [tableSelection, state.doc]);

  /*
   * Selection Sync
   */
  useEffect(() => {
    const onSelectionChange = () => {
      if (isRenderingRef.current) return;

      const container = containerRef.current;

      if (!container) return;

      if (!isSelectionInContainer(container)) return;

      const captured = captureSelection(container);

      if (!captured) return;

      const currentSelection = engine.getState().selection;

      if (
        currentSelection &&
        JSON.stringify(currentSelection.anchor) ===
          JSON.stringify(captured.anchor) &&
        JSON.stringify(currentSelection.focus) ===
          JSON.stringify(captured.focus)
      ) {
        return;
      }

      const tr = createTransaction();

      tr.steps.push(tr_setSelection(captured));

      engine.dispatch(tr);
    };

    document.addEventListener(
      'selectionchange',
      onSelectionChange,
    );

    return () => {
      document.removeEventListener(
        'selectionchange',
        onSelectionChange,
      );
    };
  }, [engine]);

  /*
   * Focus handling
   */
  const handleFocus = useCallback(() => {
    const currentState = engine.getState();

    if (!currentState.selection) {
      // Default selection points at the first BLOCK, not a text node. The first
      // block may be empty (no children); insertText is responsible for creating
      // a text node there on first keystroke.
      const tr = createTransaction();

      tr.steps.push(
        tr_setSelection(
          makeCollapsedSelection({ path: [0], offset: 0 }),
        ),
      );

      engine.dispatch(tr);
    }
  }, [engine]);

  /*
   * Keyboard handling
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return;

      // Find / Replace shortcuts — handled before the plugin system
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFindReplaceMode('find');
        setFindReplaceOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setFindReplaceMode('replace');
        setFindReplaceOpen(true);
        return;
      }

      const handled = engine.handleKeyDown(
        e.nativeEvent,
      );

      if (handled) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        handleEnter(engine);

        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();

        handleBackspace(engine);

        return;
      }
    },
    [engine, readOnly],
  );

  /*
   * Native beforeinput handler.
   *
   * IMPORTANT: We attach this via addEventListener instead of React's
   * `onBeforeInput` because React polyfills `onBeforeInput` on top of `onInput`,
   * which fires AFTER the browser has mutated the DOM. preventDefault() on the
   * synthetic event does nothing. The native `beforeinput` event is the only
   * place we can intercept input before the DOM drifts from the model.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;

    const onBeforeInput = (e: InputEvent) => {
      if (e.isComposing || isComposingRef.current) return;

      switch (e.inputType) {
        case 'insertText':
        case 'insertReplacementText': {
          if (!e.data) return;
          e.preventDefault();
          insertText(e.data)(engine);
          return;
        }
        case 'insertParagraph':
        case 'insertLineBreak': {
          e.preventDefault();
          handleEnter(engine);
          return;
        }
        case 'deleteContentBackward':
        case 'deleteWordBackward':
        case 'deleteSoftLineBackward': {
          e.preventDefault();
          handleBackspace(engine);
          return;
        }
        case 'insertFromPaste':
        case 'insertFromDrop':
          // PastePlugin owns these.
          return;
        default:
          // Block any input type we don't model so the DOM can't drift.
          e.preventDefault();
      }
    };

    container.addEventListener('beforeinput', onBeforeInput);
    return () => container.removeEventListener('beforeinput', onBeforeInput);
  }, [engine, readOnly]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;

    const onCompositionStart = () => {
      isComposingRef.current = true;
    };
    const onCompositionEnd = (e: CompositionEvent) => {
      isComposingRef.current = false;
      if (e.data) insertText(e.data)(engine);
    };

    container.addEventListener('compositionstart', onCompositionStart);
    container.addEventListener('compositionend', onCompositionEnd);
    return () => {
      container.removeEventListener('compositionstart', onCompositionStart);
      container.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [engine, readOnly]);

  /*
   * Column resize — document-level mouse tracking while drag is active
   */
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = colResizeRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      const newWidth = Math.max(40, drag.startWidth + delta);
      // Apply width visually to the col element without dispatching (perf)
      const container = containerRef.current;
      if (container) {
        const colEl = container.querySelector(
          `col[data-col-index="${drag.colIndex}"]`,
        ) as HTMLElement | null;
        if (colEl) colEl.style.width = `${newWidth}px`;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const drag = colResizeRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      const newWidth = Math.max(40, drag.startWidth + delta);
      colResizeRef.current = null;
      setColumnWidth(drag.tablePath, drag.colIndex, newWidth)(engine);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [engine]);

  /*
   * Cell selection drag — track which cells are highlighted as mouse moves
   */
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = cellDragRef.current;
      if (!drag) return;
      const td = (e.target as HTMLElement).closest('[data-cell-row]') as HTMLElement | null;
      if (!td) return;
      const row = parseInt(td.dataset.cellRow ?? '0');
      const col = parseInt(td.dataset.cellCol ?? '0');
      const tdTablePath = td.dataset.cellTablePath
        ? (JSON.parse(td.dataset.cellTablePath) as number[])
        : null;
      if (!tdTablePath || JSON.stringify(tdTablePath) !== JSON.stringify(drag.tablePath)) return;
      setTableSelection({
        tablePath: drag.tablePath,
        anchorCell: [drag.startRow, drag.startCol],
        focusCell: [row, col],
      });
    };

    const onMouseUp = () => {
      cellDragRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  /*
   * Context menu — right-click inside a table cell
   */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const td = (e.target as HTMLElement).closest('[data-cell-row]') as HTMLElement | null;
      if (!td) return;
      e.preventDefault();
      const row = parseInt(td.dataset.cellRow ?? '0');
      const col = parseInt(td.dataset.cellCol ?? '0');
      const tablePath = td.dataset.cellTablePath
        ? (JSON.parse(td.dataset.cellTablePath) as number[])
        : null;
      if (!tablePath) return;

      const cellNode = getNodeAtPath(
        engine.getState().doc,
        [...tablePath, row, col],
      ) as BlockNode | null;
      const isMerged =
        !!cellNode &&
        (((cellNode.attrs?.colspan as number) ?? 1) > 1 ||
          ((cellNode.attrs?.rowspan as number) ?? 1) > 1);

      setTableContextMenu({ x: e.clientX, y: e.clientY, tablePath, row, col, isMerged });
    },
    [engine],
  );

  /*
   * Checkbox mousedown — toggle check_list_item without moving cursor to the input
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const target = e.target as HTMLElement;

      // Column resize handle
      if ((target as HTMLElement).dataset.resizeTable) {
        e.preventDefault();
        const tablePath = JSON.parse((target as HTMLElement).dataset.resizeTable!) as number[];
        const colIndex = parseInt((target as HTMLElement).dataset.resizeCol ?? '0');
        // Read current col width from DOM
        const container = containerRef.current;
        let startWidth = 120;
        if (container) {
          const colEl = container.querySelector(
            `col[data-col-index="${colIndex}"]`,
          ) as HTMLElement | null;
          if (colEl) startWidth = parseInt(colEl.style.width) || 120;
        }
        colResizeRef.current = { tablePath, colIndex, startX: e.clientX, startWidth };
        return;
      }

      // Cell selection drag start — clear selection if clicking outside any table
      const td = (target as HTMLElement).closest('[data-cell-row]') as HTMLElement | null;
      if (!td) setTableSelection(null);
      if (td && !readOnly) {
        const row = parseInt(td.dataset.cellRow ?? '0');
        const col = parseInt(td.dataset.cellCol ?? '0');
        const tdTablePath = td.dataset.cellTablePath
          ? (JSON.parse(td.dataset.cellTablePath) as number[])
          : null;
        if (tdTablePath) {
          cellDragRef.current = { tablePath: tdTablePath, startRow: row, startCol: col };
          setTableSelection({
            tablePath: tdTablePath,
            anchorCell: [row, col],
            focusCell: [row, col],
          });
        }
      }

      // Checkbox toggle
      if (
        target.tagName === 'INPUT' &&
        (target as HTMLInputElement).type === 'checkbox' &&
        target.dataset.checkPath
      ) {
        e.preventDefault();
        toggleCheckItemAt(JSON.parse(target.dataset.checkPath))(engine);
      }
    },
    [engine, readOnly],
  );

  /*
   * Click handling
   */
  const handleClick = useCallback(() => {
    const container = containerRef.current;

    if (!container) return;

    const selection =
      captureSelection(container);

    if (!selection) return;

    const tr = createTransaction();

    tr.steps.push(
      tr_setSelection(selection),
    );

    engine.dispatch(tr);
  }, [engine]);

  /*
   * Image dialog
   */
  const handleInsertImage = useCallback(() => {
    setShowImageDialog(true);
  }, []);

  const confirmInsertImage = useCallback(() => {
    if (imageURL.trim()) {
      insertImage(
        imageURL.trim(),
        'image',
      )(engine);
    }

    setShowImageDialog(false);

    setImageURL('');
  }, [engine, imageURL]);

  /*
   * Empty state
   */
  const isEmpty = state.doc.children.every(
    (block) => block.children.length === 0,
  );

  return (
    <div
      className={`editor-root relative flex flex-col h-full ${className}`}
    >
      {!readOnly && (
        <Toolbar
          engine={engine}
          onInsertImage={handleInsertImage}
          onFindReplace={(mode) => {
            setFindReplaceMode(mode);
            setFindReplaceOpen(true);
          }}
        />
      )}

      <div className="relative flex-1 overflow-auto">
        {isEmpty && (
          <div
            className="
              absolute
              top-4
              left-6
              pointer-events-none
              select-none
              text-base
              text-gray-400
              dark:text-gray-500
            "
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}

        <div
          ref={containerRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Rich text editor"
          spellCheck
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          onFocus={handleFocus}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={[
            'editor-canvas',
            'min-h-full',
            'px-6',
            'py-4',
            'outline-none',
            'text-base',
            'leading-relaxed',
            'text-gray-900',
            'dark:text-gray-100',
            readOnly
              ? 'cursor-default'
              : 'cursor-text',
          ].join(' ')}
        />
      </div>

      {tableContextMenu && (
        <TableContextMenu
          x={tableContextMenu.x}
          y={tableContextMenu.y}
          tablePath={tableContextMenu.tablePath}
          row={tableContextMenu.row}
          col={tableContextMenu.col}
          isMerged={tableContextMenu.isMerged}
          tableSelection={tableSelection}
          engine={engine}
          onClose={() => setTableContextMenu(null)}
        />
      )}

      {findReplaceOpen && (
        <FindReplaceModal
          engine={engine}
          editorContainer={containerRef}
          initialMode={findReplaceMode}
          onClose={() => setFindReplaceOpen(false)}
        />
      )}

      {showImageDialog && (
        <div
          className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/50
          "
          onClick={() =>
            setShowImageDialog(false)
          }
        >
          <div
            className="
              w-96
              rounded-lg
              bg-white
              p-6
              shadow-xl
              dark:bg-gray-800
            "
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <h3
              className="
                mb-4
                text-lg
                font-semibold
                text-gray-900
                dark:text-gray-100
              "
            >
              Insert Image
            </h3>

            <input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={imageURL}
              onChange={(e) =>
                setImageURL(
                  e.target.value,
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmInsertImage();
                }
              }}
              autoFocus
              className="
                w-full
                rounded-md
                border
                border-gray-300
                bg-white
                px-3
                py-2
                text-sm
                text-gray-900
                focus:outline-none
                focus:ring-2
                focus:ring-blue-500
                dark:border-gray-600
                dark:bg-gray-700
                dark:text-gray-100
              "
            />

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() =>
                  setShowImageDialog(false)
                }
                className="
                  rounded-md
                  px-4
                  py-2
                  text-sm
                  text-gray-700
                  hover:bg-gray-100
                  dark:text-gray-300
                  dark:hover:bg-gray-700
                "
              >
                Cancel
              </button>

              <button
                onClick={
                  confirmInsertImage
                }
                className="
                  rounded-md
                  bg-blue-600
                  px-4
                  py-2
                  text-sm
                  text-white
                  hover:bg-blue-700
                "
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}