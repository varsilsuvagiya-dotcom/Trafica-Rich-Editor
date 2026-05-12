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
import { TableToolbar } from './toolbar/TableToolbar';
import { ImageToolbar } from './toolbar/ImageToolbar';
import { getNodeAtPath } from '../editor/core/DocumentModel';
import { findCellPosition } from '../editor/table/TableModel';
import { setColumnWidth } from '../editor/table/TableCommands';
import type { BlockNode } from '../types';

import { htmlSerializer } from '../editor/serialization/HTMLSerializer';
import { jsonSerializer } from '../editor/serialization/JSONSerializer';

import { insertImage, deleteImageAtPath, setImageAttr } from '../editor/commands';

interface EditorProps {
  engine: EditorEngine;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  onHTMLChange?: (html: string) => void;
  onJSONChange?: (json: string) => void;
  /** Called when Ctrl/Cmd+K is pressed — parent opens the link popup */
  onOpenLinkPopup?: () => void;
  /** Custom upload handler. Receives a File, returns the final URL. If omitted, blob URLs are used. */
  onUploadImage?: (file: File) => Promise<string>;
}

export function Editor({
  engine,
  placeholder = 'Start writing...',
  className = '',
  readOnly = false,
  onHTMLChange,
  onJSONChange,
  onOpenLinkPopup,
  onUploadImage: _onUploadImage,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const isRenderingRef = useRef(false);
  const isComposingRef = useRef(false);

  const stateRef = useRef<EditorState>(engine.getState());

  const [selectedImagePath, setSelectedImagePath] = useState<number[] | null>(null);
  const [findReplaceOpen,   setFindReplaceOpen]    = useState(false);
  const [findReplaceMode,   setFindReplaceMode]    = useState<'find' | 'replace'>('find');
  const [linkPopupOpen,     setLinkPopupOpen]      = useState(false);
  const [linkTooltip, setLinkTooltip] = useState<{
    href: string; x: number; y: number;
  } | null>(null);
  const linkTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Detect cursor inside a table for the floating TableToolbar
  const inTableCellPos = state.selection
    ? findCellPosition(state.doc, state.selection.anchor.path)
    : null;

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
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setLinkPopupOpen(true);
        onOpenLinkPopup?.();
        return;
      }

      // Delete/Backspace on a selected image
      if (selectedImagePath && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteImageAtPath(selectedImagePath)(engine);
        setSelectedImagePath(null);
        return;
      }
      // Any key clears image selection so typing resumes normally
      if (selectedImagePath) setSelectedImagePath(null);

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
    [engine, readOnly, onOpenLinkPopup, selectedImagePath],
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
   * Link tooltip — show on hover, open on Ctrl+Click
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseOver = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.editor-link');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;
      if (linkTooltipTimerRef.current) clearTimeout(linkTooltipTimerRef.current);
      linkTooltipTimerRef.current = setTimeout(() => {
        const rect = anchor.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setLinkTooltip({
          href,
          x: rect.left - containerRect.left,
          y: rect.bottom - containerRect.top + 6,
        });
      }, 200);
    };

    const onMouseOut = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a.editor-link');
      if (!anchor) return;
      if (linkTooltipTimerRef.current) clearTimeout(linkTooltipTimerRef.current);
      setLinkTooltip(null);
    };

    const onClick = (e: MouseEvent) => {
      // Ctrl/Cmd + click on a link → open in new tab
      if (!(e.ctrlKey || e.metaKey)) return;
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.editor-link');
      if (!anchor) return;
      e.preventDefault();
      const href = anchor.getAttribute('href');
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    };

    container.addEventListener('mouseover', onMouseOver);
    container.addEventListener('mouseout', onMouseOut);
    container.addEventListener('click', onClick);
    return () => {
      container.removeEventListener('mouseover', onMouseOver);
      container.removeEventListener('mouseout', onMouseOut);
      container.removeEventListener('click', onClick);
      if (linkTooltipTimerRef.current) clearTimeout(linkTooltipTimerRef.current);
    };
  }, []);

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

      // Image resize handle
      if (target.dataset.resizeImagePath) {
        e.preventDefault();
        const imagePath = JSON.parse(target.dataset.resizeImagePath) as number[];
        const corner = target.dataset.resizeImagePos ?? 'se';
        const container = containerRef.current;
        let startWidth = 300;
        if (container) {
          const fig = container.querySelector(`[data-image-path="${JSON.stringify(imagePath)}"]`);
          const img = fig?.querySelector('img') as HTMLImageElement | null;
          if (img) startWidth = img.getBoundingClientRect().width || 300;
        }
        imageResizeRef.current = {
          imagePath, corner, startX: e.clientX, startY: e.clientY,
          startWidth, startHeight: 0,
        };
        return;
      }

      // Image click — select image
      const fig = target.closest('[data-image-path]') as HTMLElement | null;
      if (fig?.dataset.imagePath) {
        e.preventDefault();
        setSelectedImagePath(JSON.parse(fig.dataset.imagePath));
        return;
      }
      // Clear image selection when clicking elsewhere
      setSelectedImagePath(null);

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
          if (colEl) startWidth = colEl.getBoundingClientRect().width || 120;
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
   * Image resize drag — document-level tracking
   */
  const imageResizeRef = useRef<{
    imagePath: number[]; corner: string;
    startX: number; startY: number; startWidth: number; startHeight: number;
  } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = imageResizeRef.current;
      if (!drag) return;
      const deltaX = e.clientX - drag.startX;
      const isRight = drag.corner === 'ne' || drag.corner === 'se';
      const newWidth = Math.max(60, drag.startWidth + (isRight ? deltaX : -deltaX));
      // Update DOM visually without dispatching
      const container = containerRef.current;
      if (container) {
        const fig = container.querySelector(
          `[data-image-path="${JSON.stringify(drag.imagePath)}"]`,
        ) as HTMLElement | null;
        const img = fig?.querySelector('img') as HTMLImageElement | null;
        if (img) img.style.width = `${newWidth}px`;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      const drag = imageResizeRef.current;
      if (!drag) return;
      const deltaX = e.clientX - drag.startX;
      const isRight = drag.corner === 'ne' || drag.corner === 'se';
      const newWidth = Math.max(60, drag.startWidth + (isRight ? deltaX : -deltaX));
      imageResizeRef.current = null;
      setImageAttr(drag.imagePath, { width: newWidth })(engine);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [engine]);

  /*
   * Apply / remove selected-image highlight in DOM
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('[data-image-path]').forEach((el) => {
      el.removeAttribute('data-selected');
    });
    if (selectedImagePath) {
      const fig = container.querySelector(
        `[data-image-path="${JSON.stringify(selectedImagePath)}"]`,
      );
      if (fig) fig.setAttribute('data-selected', 'true');
    }
  }, [selectedImagePath, state.doc]);

  /*
   * Drag & drop image files onto the editor canvas
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const blobUrl = URL.createObjectURL(file);
      insertImage(blobUrl, file.name.replace(/\.[^.]+$/, ''))(engine);
    };
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);
    };
  }, [engine, readOnly]);

  /*
   * Empty state
   */
  const isEmpty =
    state.doc.children.length === 1 &&
    state.doc.children[0].type === 'paragraph' &&
    state.doc.children[0].children.length === 0;

  return (
    <div
      className={`editor-root relative flex flex-col h-full ${className}`}
    >
      {!readOnly && (
        <Toolbar
          engine={engine}
          onFindReplace={(mode) => {
            setFindReplaceMode(mode);
            setFindReplaceOpen(true);
          }}
          linkPopupOpen={linkPopupOpen}
          onLinkPopupClose={() => setLinkPopupOpen(false)}
        />
      )}

      <div className="relative flex-1 overflow-auto">
        {isEmpty && (
          <div
            className="
              absolute
              top-6
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

        {/* Link hover tooltip */}
        {linkTooltip && (
          <div
            role="tooltip"
            style={{ left: linkTooltip.x, top: linkTooltip.y }}
            className="absolute z-50 pointer-events-none flex items-center gap-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs px-2.5 py-1.5 rounded shadow-lg max-w-xs"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-70" aria-hidden="true">
              <path d="M6.5 3.5H4A2.5 2.5 0 0 0 4 8.5h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M9.5 3.5H12A2.5 2.5 0 0 1 12 8.5h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M5.5 6h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <span className="truncate">{linkTooltip.href}</span>
            <span className="shrink-0 opacity-50 ml-1">Ctrl+click to open</span>
          </div>
        )}
      </div>

      {inTableCellPos && !readOnly && (
        <TableToolbar
          engine={engine}
          tablePath={inTableCellPos.tablePath}
          cellPos={{ row: inTableCellPos.row, col: inTableCellPos.col }}
          tableSelection={tableSelection}
          editorContainer={containerRef}
        />
      )}

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

      {selectedImagePath && !readOnly && (
        <ImageToolbar
          engine={engine}
          imagePath={selectedImagePath}
          editorContainer={containerRef}
          onClose={() => setSelectedImagePath(null)}
        />
      )}
    </div>
  );
}