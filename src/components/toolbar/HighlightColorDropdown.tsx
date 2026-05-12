'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { setHighlightColor } from '../../editor/commands';

// ─── Config ───────────────────────────────────────────────────────────────────

interface ColorOption {
  label: string;
  value: string;
}

const COLORS: ColorOption[] = [
  { label: 'Yellow',     value: '#FFFF00' },
  { label: 'Lime',       value: '#00FF7F' },
  { label: 'Pink',       value: '#FFB6C1' },
  { label: 'Sky Blue',   value: '#87CEEB' },
  { label: 'Orange',     value: '#FFA500' },
  { label: 'Lavender',   value: '#DDA0DD' },
  { label: 'Cyan',       value: '#AFEEEE' },
  { label: 'Coral',      value: '#FF6B6B' },
];

const DEFAULT_COLOR = COLORS[0].value;

// ─── Component ────────────────────────────────────────────────────────────────

interface HighlightColorDropdownProps {
  engine: EditorEngine;
  activeColor: string | null;
}

export function HighlightColorDropdown({ engine, activeColor }: HighlightColorDropdownProps) {
  const [open, setOpen] = useState(false);
  // Track last-used color so the quick-apply button remembers it
  const [lastColor, setLastColor] = useState(DEFAULT_COLOR);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeColor) setLastColor(activeColor);
  }, [activeColor]);

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  function applyColor(color: string | null) {
    if (color) setLastColor(color);
    setHighlightColor(color)(engine);
    setOpen(false);
  }

  // Quick-apply left-button: if the active color is already lastColor → remove; otherwise apply
  function handleQuickApply() {
    if (activeColor === lastColor) {
      setHighlightColor(null)(engine);
    } else {
      setHighlightColor(lastColor)(engine);
    }
  }

  const isActive = activeColor !== null;

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* ── Quick-apply button ── */}
      <button
        type="button"
        title={`Highlight (${lastColor})`}
        onMouseDown={(e) => { e.preventDefault(); handleQuickApply(); }}
        className={[
          'flex flex-col items-center justify-center gap-px w-8 h-8 rounded-l transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          isActive
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <HighlighterBody />
        {/* Color strip under the icon — shows the last-used / active color */}
        <span
          className="block w-4 h-1 rounded-sm"
          style={{ backgroundColor: activeColor ?? lastColor }}
        />
      </button>

      {/* ── Dropdown-arrow button ── */}
      <button
        type="button"
        title="More highlight colors"
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={(e) => { e.preventDefault(); setOpen((p) => !p); }}
        className={[
          'flex items-center justify-center w-4 h-8 rounded-r transition-colors',
          'border-l border-gray-200 dark:border-gray-600',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          open
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <ChevronDownIcon />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          role="dialog"
          aria-label="Highlight color picker"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-2.5"
        >
          {/* Remove highlight */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyColor(null); }}
            className="flex items-center gap-2 w-full px-2 py-1.5 mb-2 text-sm rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <EraserIcon />
            <span>Remove highlight</span>
          </button>

          {/* Color swatches — 4 per row */}
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map((c) => {
              const isSelected = activeColor === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  title={c.label}
                  onMouseDown={(e) => { e.preventDefault(); applyColor(c.value); }}
                  className={[
                    'relative flex items-center justify-center w-8 h-8 rounded transition-transform',
                    'hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500',
                    isSelected ? 'ring-2 ring-offset-1 ring-blue-500' : '',
                  ].join(' ')}
                  style={{ backgroundColor: c.value }}
                >
                  {isSelected && <CheckIcon />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

/** Highlighter-pen silhouette — color strip is rendered separately below it */
function HighlighterBody() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 21h14" />
      <path d="m5 11 9-9 7 7-9 9H5l-2-2 2-5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 drop-shadow" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
