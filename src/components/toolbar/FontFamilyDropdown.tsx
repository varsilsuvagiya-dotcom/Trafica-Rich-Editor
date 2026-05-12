'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { setFontFamily } from '../../editor/commands';

// ─── Config ───────────────────────────────────────────────────────────────────

interface FontOption {
  label: string;
  value: string; // stored in mark attrs and applied as CSS font-family
}

const FONTS: FontOption[] = [
  { label: 'Inter',               value: 'Inter, sans-serif' },
  { label: 'Arial',               value: 'Arial, sans-serif' },
  { label: 'Courier New',         value: '"Courier New", Courier, monospace' },
  { label: 'Georgia',             value: 'Georgia, serif' },
  { label: 'Lucida Sans Unicode', value: '"Lucida Sans Unicode", "Lucida Grande", sans-serif' },
  { label: 'Tahoma',              value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Times New Roman',     value: '"Times New Roman", Times, serif' },
  { label: 'Trebuchet MS',        value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Verdana',             value: 'Verdana, Geneva, sans-serif' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface FontFamilyDropdownProps {
  engine: EditorEngine;
  activeFontFamily: string | null;
}

export function FontFamilyDropdown({ engine, activeFontFamily }: FontFamilyDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDropdown(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Focus custom input when it appears
  useEffect(() => {
    if (showCustomInput) customInputRef.current?.focus();
  }, [showCustomInput]);

  function closeDropdown() {
    setOpen(false);
    setShowCustomInput(false);
    setCustomValue('');
  }

  function applyFont(value: string | null) {
    setFontFamily(value)(engine);
    closeDropdown();
  }

  function applyCustom() {
    const trimmed = customValue.trim();
    if (!trimmed) return;
    applyFont(trimmed);
  }

  // Find the predefined option matching the active family (if any)
  const activeOption = activeFontFamily
    ? FONTS.find((f) => f.value === activeFontFamily) ?? null
    : null;

  // Trigger label: predefined name, or first ~10 chars of custom value, or placeholder
  const triggerLabel = activeOption
    ? activeOption.label
    : activeFontFamily
      ? activeFontFamily.split(',')[0].replace(/['"]/g, '').trim().slice(0, 10)
      : 'Font';

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        title="Font family"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) { closeDropdown(); return; }
          setShowCustomInput(false);
          setCustomValue('');
          setOpen(true);
        }}
        className={[
          'flex items-center gap-0.5 px-1.5 h-8 rounded text-sm font-medium transition-colors min-w-[60px] max-w-[120px]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          open
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <FontIcon />
        <span className="flex-1 text-left truncate">{triggerLabel}</span>
        <ChevronDownIcon />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label="Font family"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[200px]"
        >
          {/* Default / reset */}
          <button
            type="button"
            role="option"
            aria-selected={activeFontFamily === null}
            onMouseDown={(e) => { e.preventDefault(); applyFont(null); }}
            className={[
              'w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors',
              activeFontFamily === null
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
            ].join(' ')}
          >
            <span>Default</span>
            {activeFontFamily === null && <CheckIcon />}
          </button>

          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

          {/* Predefined fonts */}
          {FONTS.map((font) => {
            const isActive = activeFontFamily === font.value;
            return (
              <button
                key={font.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => { e.preventDefault(); applyFont(font.value); }}
                className={[
                  'w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                <span style={{ fontFamily: font.value }}>{font.label}</span>
                {isActive && <CheckIcon />}
              </button>
            );
          })}

          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

          {/* Custom font */}
          {showCustomInput ? (
            <div className="px-3 py-2 flex gap-1.5">
              <input
                ref={customInputRef}
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); applyCustom(); }
                  if (e.key === 'Escape') { e.preventDefault(); setShowCustomInput(false); }
                }}
                placeholder="Font name…"
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyCustom(); }}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 whitespace-nowrap"
              >
                Apply
              </button>
            </div>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setCustomValue('');
                setShowCustomInput(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <PlusIcon />
              Custom Font
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function FontIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
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

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
