'use client';

/**
 * TableButton
 *
 * Toolbar button that opens a CKEditor-style grid-selector popup.
 * Hovering over the grid highlights the selection area and shows a live
 * "rows × cols" preview. Clicking inserts the table at the cursor.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { insertTable } from '../../editor/table/TableCommands';

const MAX_ROWS = 10;
const MAX_COLS = 10;

interface TableButtonProps {
  engine: EditorEngine;
}

export function TableButton({ engine }: TableButtonProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<[number, number]>([0, 0]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setHovered([0, 0]);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  const handleSelect = useCallback(
    (rows: number, cols: number) => {
      insertTable(rows, cols)(engine);
      close();
    },
    [engine, close],
  );

  const [hovRows, hovCols] = hovered;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        title="Insert table"
        aria-label="Insert table"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex items-center gap-1 rounded px-1.5 py-1 text-sm',
          'text-gray-700 dark:text-gray-300',
          'hover:bg-gray-100 dark:hover:bg-gray-700',
          open ? 'bg-gray-100 dark:bg-gray-700' : '',
        ].join(' ')}
      >
        <TableIcon />
        <svg
          className="h-2.5 w-2.5 opacity-60"
          viewBox="0 0 10 6"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {open && (
        <div
          ref={popupRef}
          role="dialog"
          aria-label="Select table size"
          className={[
            'absolute left-0 top-full z-50 mt-1',
            'rounded-lg border border-gray-200 bg-white p-3 shadow-xl',
            'dark:border-gray-700 dark:bg-gray-800',
          ].join(' ')}
          onMouseLeave={() => setHovered([0, 0])}
        >
          {/* Grid */}
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1.25rem)` }}
          >
            {Array.from({ length: MAX_ROWS }, (_, r) =>
              Array.from({ length: MAX_COLS }, (_, c) => {
                const active = r <= hovRows && c <= hovCols;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    aria-label={`${r + 1} rows × ${c + 1} columns`}
                    onMouseEnter={() => setHovered([r, c])}
                    onFocus={() => setHovered([r, c])}
                    onClick={() => handleSelect(r + 1, c + 1)}
                    className={[
                      'h-5 w-5 rounded-sm border transition-colors duration-75',
                      active
                        ? 'border-blue-400 bg-blue-100 dark:border-blue-500 dark:bg-blue-900/40'
                        : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700',
                    ].join(' ')}
                  />
                );
              }),
            )}
          </div>

          {/* Size preview label */}
          <p className="mt-2 text-center text-xs font-medium text-gray-600 dark:text-gray-400">
            {hovRows + 1} × {hovCols + 1}
          </p>
        </div>
      )}
    </div>
  );
}

function TableIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}
