'use client';

import React, { useLayoutEffect, useRef } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import {
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  mergeCells,
  splitCell,
  deleteTable,
  toggleHeaderRow,
} from '../../editor/table/TableCommands';
import { getNodeAtPath } from '../../editor/core/DocumentModel';
import type { BlockNode } from '../../types';

interface TableToolbarProps {
  engine: EditorEngine;
  tablePath: number[];
  cellPos: { row: number; col: number };
  tableSelection: {
    tablePath: number[];
    anchorCell: [number, number];
    focusCell: [number, number];
  } | null;
  editorContainer: React.RefObject<HTMLDivElement | null>;
}

export function TableToolbar({
  engine,
  tablePath,
  cellPos,
  tableSelection,
  editorContainer,
}: TableToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = editorContainer.current;
    const toolbar = toolbarRef.current;
    if (!container || !toolbar) return;
    const tableWrapper = container.querySelector(
      `[data-block-path="${JSON.stringify(tablePath)}"]`,
    ) as HTMLElement | null;
    if (!tableWrapper) return;
    const rect = tableWrapper.getBoundingClientRect();
    const toolbarH = toolbar.offsetHeight || 36;
    const top = Math.max(4, rect.top - toolbarH - 6);
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${rect.left}px`;
    toolbar.style.visibility = 'visible';
  });

  const run = (cmd: (e: typeof engine) => boolean) => {
    cmd(engine);
  };

  const hasMultiCellSelection =
    tableSelection !== null &&
    tableSelection.tablePath.join(',') === tablePath.join(',') &&
    (tableSelection.anchorCell[0] !== tableSelection.focusCell[0] ||
      tableSelection.anchorCell[1] !== tableSelection.focusCell[1]);

  const state = engine.getState();
  const cellNode = getNodeAtPath(state.doc, [...tablePath, cellPos.row, cellPos.col]) as BlockNode | null;
  const isMerged =
    !!cellNode &&
    (((cellNode.attrs?.colspan as number) ?? 1) > 1 ||
      ((cellNode.attrs?.rowspan as number) ?? 1) > 1);

  const tableNode = getNodeAtPath(state.doc, tablePath) as BlockNode | null;
  const hasHeaderRow = !!tableNode && (tableNode.children[0] as BlockNode)?.children?.some(
    (c) => (c as BlockNode).type === 'table_header',
  );

  return (
    <div
      ref={toolbarRef}
      style={{ position: 'fixed', visibility: 'hidden', zIndex: 9000 }}
      onMouseDown={(e) => e.preventDefault()}
      className="flex items-center gap-px rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-lg dark:border-gray-600 dark:bg-gray-800"
    >
      {/* Header row toggle */}
      <Btn
        title="Toggle header row"
        active={hasHeaderRow}
        onClick={() => run(toggleHeaderRow(tablePath))}
      >
        <HeaderRowIcon />
      </Btn>
      <Sep />

      {/* Row ops */}
      <Btn title="Insert row above" onClick={() => run(addRowAbove)}>
        <RowAboveIcon />
      </Btn>
      <Btn title="Insert row below" onClick={() => run(addRowBelow)}>
        <RowBelowIcon />
      </Btn>
      <Btn title="Delete row" onClick={() => run(deleteRow)} danger>
        <DeleteRowIcon />
      </Btn>
      <Sep />

      {/* Column ops */}
      <Btn title="Insert column left" onClick={() => run(addColumnLeft)}>
        <ColLeftIcon />
      </Btn>
      <Btn title="Insert column right" onClick={() => run(addColumnRight)}>
        <ColRightIcon />
      </Btn>
      <Btn title="Delete column" onClick={() => run(deleteColumn)} danger>
        <DeleteColIcon />
      </Btn>

      {/* Merge / split */}
      {(hasMultiCellSelection || isMerged) && <Sep />}
      {hasMultiCellSelection && tableSelection && (
        <Btn title="Merge cells" onClick={() => run(mergeCells(tableSelection))}>
          <MergeIcon />
        </Btn>
      )}
      {isMerged && (
        <Btn title="Split cell" onClick={() => run(splitCell)}>
          <SplitIcon />
        </Btn>
      )}

      <Sep />
      <Btn title="Delete table" onClick={() => run(deleteTable)} danger>
        <DeleteTableIcon />
      </Btn>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Btn({
  title,
  onClick,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={[
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          : active
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-600" />;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function HeaderRowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="14" height="14" rx="1.5" />
      <line x1="1" y1="6" x2="15" y2="6" />
      <rect x="1" y="1" width="14" height="5" rx="1.5" fill="currentColor" opacity="0.18" stroke="none" />
    </svg>
  );
}

function RowAboveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="7" width="14" height="8" rx="1" />
      <line x1="5" y1="7" x2="5" y2="15" />
      <line x1="10" y1="7" x2="10" y2="15" />
      <line x1="8" y1="1" x2="8" y2="6" />
      <polyline points="5 3 8 1 11 3" />
    </svg>
  );
}

function RowBelowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="14" height="8" rx="1" />
      <line x1="5" y1="1" x2="5" y2="9" />
      <line x1="10" y1="1" x2="10" y2="9" />
      <line x1="8" y1="10" x2="8" y2="15" />
      <polyline points="5 13 8 15 11 13" />
    </svg>
  );
}

function DeleteRowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="8" rx="1" />
      <line x1="5" y1="4" x2="5" y2="12" />
      <line x1="10" y1="4" x2="10" y2="12" />
      <line x1="6" y1="8" x2="10" y2="8" />
    </svg>
  );
}

function ColLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="1" width="8" height="14" rx="1" />
      <line x1="7" y1="5" x2="15" y2="5" />
      <line x1="7" y1="10" x2="15" y2="10" />
      <line x1="1" y1="8" x2="6" y2="8" />
      <polyline points="3 5 1 8 3 11" />
    </svg>
  );
}

function ColRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="8" height="14" rx="1" />
      <line x1="1" y1="5" x2="9" y2="5" />
      <line x1="1" y1="10" x2="9" y2="10" />
      <line x1="10" y1="8" x2="15" y2="8" />
      <polyline points="13 5 15 8 13 11" />
    </svg>
  );
}

function DeleteColIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="1" width="8" height="14" rx="1" />
      <line x1="4" y1="5" x2="12" y2="5" />
      <line x1="4" y1="10" x2="12" y2="10" />
      <line x1="8" y1="5" x2="8" y2="10" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="14" height="14" rx="1.5" />
      <line x1="8" y1="1" x2="8" y2="15" />
      <line x1="1" y1="8" x2="15" y2="8" />
      <polyline points="5 5 8 8 11 5" />
      <polyline points="5 11 8 8 11 11" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="14" height="14" rx="1.5" />
      <line x1="8" y1="1" x2="8" y2="15" />
      <line x1="1" y1="8" x2="15" y2="8" />
      <polyline points="5 6 8 3 11 6" />
      <polyline points="5 10 8 13 11 10" />
    </svg>
  );
}

function DeleteTableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="14" height="14" rx="1.5" />
      <line x1="5" y1="5" x2="11" y2="11" />
      <line x1="11" y1="5" x2="5" y2="11" />
    </svg>
  );
}
