'use client';

/**
 * TableContextMenu
 *
 * Right-click context menu for table operations. Rendered as a portal so it
 * floats above the editor canvas. Closes on outside click, Escape, or scroll.
 *
 * Props:
 *   x, y          – screen position (from contextmenu event)
 *   tablePath     – path to the table node
 *   row, col      – cell that was right-clicked
 *   isMerged      – true when the clicked cell has colspan/rowspan > 1
 *   hasTableSelection – true when multiple cells are selected (enables Merge)
 *   engine        – editor engine
 *   tableSelection – current cell selection (for Merge Cells)
 *   onClose       – called when the menu should dismiss
 */

import React, { useEffect, useRef } from 'react';
import type { EditorEngine } from '../editor/core/EditorEngine';
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
} from '../editor/table/TableCommands';

export interface TableContextMenuProps {
  x: number;
  y: number;
  tablePath: number[];
  row: number;
  col: number;
  isMerged: boolean;
  tableSelection: {
    tablePath: number[];
    anchorCell: [number, number];
    focusCell: [number, number];
  } | null;
  engine: EditorEngine;
  onClose: () => void;
}

export function TableContextMenu({
  x,
  y,
  tablePath,
  row: _row,
  col: _col,
  isMerged,
  tableSelection,
  engine,
  onClose,
}: TableContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click / scroll / Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Clamp menu position to stay within viewport
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 350),
    zIndex: 9999,
  };

  const run = (cmd: (e: typeof engine) => boolean) => {
    cmd(engine);
    onClose();
  };

  const hasMultiCellSelection =
    tableSelection !== null &&
    (tableSelection.anchorCell[0] !== tableSelection.focusCell[0] ||
      tableSelection.anchorCell[1] !== tableSelection.focusCell[1]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Table options"
      style={menuStyle}
      className="min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
    >
      <MenuSection label="Row">
        <MenuItem onClick={() => run(addRowAbove)}>Insert row above</MenuItem>
        <MenuItem onClick={() => run(addRowBelow)}>Insert row below</MenuItem>
        <MenuItem onClick={() => run(deleteRow)} danger>Delete row</MenuItem>
      </MenuSection>

      <Divider />

      <MenuSection label="Column">
        <MenuItem onClick={() => run(addColumnLeft)}>Insert column left</MenuItem>
        <MenuItem onClick={() => run(addColumnRight)}>Insert column right</MenuItem>
        <MenuItem onClick={() => run(deleteColumn)} danger>Delete column</MenuItem>
      </MenuSection>

      <Divider />

      <MenuSection label="Cell">
        {hasMultiCellSelection && tableSelection && (
          <MenuItem onClick={() => run(mergeCells(tableSelection))}>
            Merge cells
          </MenuItem>
        )}
        {isMerged && (
          <MenuItem onClick={() => run(splitCell)}>Split cell</MenuItem>
        )}
        {!hasMultiCellSelection && !isMerged && (
          <MenuItem disabled>Merge cells (select multiple)</MenuItem>
        )}
      </MenuSection>

      <Divider />

      <MenuItem onClick={() => run(deleteTable)} danger>
        Delete table
      </MenuItem>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function Divider() {
  return <hr className="my-1 border-gray-100 dark:border-gray-700" />;
}

interface MenuItemProps {
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

function MenuItem({ onClick, danger, disabled, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        'flex w-full items-center px-3 py-1.5 text-sm',
        disabled
          ? 'cursor-default text-gray-300 dark:text-gray-600'
          : danger
          ? 'cursor-pointer text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          : 'cursor-pointer text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
