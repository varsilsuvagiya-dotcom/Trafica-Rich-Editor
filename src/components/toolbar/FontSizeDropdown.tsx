'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { setFontSize } from '../../editor/commands';

// ─── Config ───────────────────────────────────────────────────────────────────

const SIZES = ['8', '10', '12', '14', '16', '18', '24', '32', '48'];

// ─── Component ────────────────────────────────────────────────────────────────

interface FontSizeDropdownProps {
  engine: EditorEngine;
  activeFontSize: string | null; // stored as e.g. '12px', null = default
}

export function FontSizeDropdown({ engine, activeFontSize }: FontSizeDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Show the numeric part only (e.g. '12' from '12px')
  const activeNum = activeFontSize ? activeFontSize.replace('px', '') : null;
  const label = activeNum ?? 'Size';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title="Font size"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
        className={[
          'flex items-center gap-0.5 px-1.5 h-8 rounded text-sm font-medium transition-colors min-w-[52px]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          open
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <span className="flex-1 text-left">{label}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Font size"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[88px] max-h-64 overflow-y-auto"
        >
          {/* Default / reset */}
          <button
            type="button"
            role="option"
            aria-selected={activeFontSize === null}
            onMouseDown={(e) => {
              e.preventDefault();
              setFontSize(null)(engine);
              setOpen(false);
            }}
            className={[
              'w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors',
              activeFontSize === null
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
            ].join(' ')}
          >
            <span>Default</span>
            {activeFontSize === null && <CheckIcon />}
          </button>

          {SIZES.map((size) => {
            const isActive = activeNum === size;
            return (
              <button
                key={size}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFontSize(`${size}px`)(engine);
                  setOpen(false);
                }}
                className={[
                  'w-full flex items-center justify-between px-3 py-1.5 transition-colors',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                <span style={{ fontSize: `${size}px`, lineHeight: 1.3 }}>{size}</span>
                {isActive && <CheckIcon />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function ChevronDownIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
