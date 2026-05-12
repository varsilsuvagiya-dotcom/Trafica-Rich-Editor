'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { setTextColor } from '../../editor/commands';

// ─── Config ───────────────────────────────────────────────────────────────────

interface ColorOption {
  label: string;
  value: string;
  border?: boolean; // true for white/near-white swatches that need a border
}

// 5-column grid — row 1 grays, row 2 warms, row 3 cools
const PRESET_COLORS: ColorOption[] = [
  // Grays
  { label: 'Black',       value: '#000000' },
  { label: 'Dim Gray',    value: '#4D4D4D' },
  { label: 'Gray',        value: '#808080' },
  { label: 'Silver',      value: '#BFBFBF' },
  { label: 'White',       value: '#FFFFFF', border: true },
  // Warms
  { label: 'Red',         value: '#E03C31' },
  { label: 'Orange',      value: '#F5821F' },
  { label: 'Yellow',      value: '#F4D03F' },
  { label: 'Lime',        value: '#7DCA59' },
  { label: 'Green',       value: '#27AE60' },
  // Cools
  { label: 'Teal',        value: '#1ABC9C' },
  { label: 'Sky Blue',    value: '#5DADE2' },
  { label: 'Blue',        value: '#2E86C1' },
  { label: 'Purple',      value: '#8E44AD' },
  { label: 'Pink',        value: '#E91E8C' },
];

const DEFAULT_COLOR = '#000000';

// ─── Component ────────────────────────────────────────────────────────────────

interface TextColorDropdownProps {
  engine: EditorEngine;
  activeColor: string | null;
  documentColors: string[]; // unique colors currently used in the document
}

export function TextColorDropdown({
  engine,
  activeColor,
  documentColors,
}: TextColorDropdownProps) {
  const [open, setOpen] = useState(false);
  const [lastColor, setLastColor] = useState(DEFAULT_COLOR);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeColor) setLastColor(activeColor);
  }, [activeColor]);

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

  function applyColor(color: string | null) {
    if (color) setLastColor(color);
    setTextColor(color)(engine);
    setOpen(false);
  }

  function handleQuickApply() {
    // Toggle: remove if already applied, otherwise apply last color
    if (activeColor === lastColor) {
      setTextColor(null)(engine);
    } else {
      setTextColor(lastColor)(engine);
    }
  }

  function handleNativePicker(e: React.ChangeEvent<HTMLInputElement>) {
    applyColor(e.target.value);
  }

  function openNativePicker(e: React.MouseEvent) {
    e.preventDefault();
    setOpen(false);
    // Brief delay so the dropdown unmounts before the native dialog appears
    setTimeout(() => nativePickerRef.current?.click(), 30);
  }

  // Deduplicate documentColors that are already in the preset list
  const extraDocColors = documentColors.filter(
    (c) => !PRESET_COLORS.some((p) => p.value.toUpperCase() === c.toUpperCase()),
  );

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* ── Quick-apply button ── */}
      <button
        type="button"
        title={`Text color (${lastColor})`}
        onMouseDown={(e) => { e.preventDefault(); handleQuickApply(); }}
        className={[
          'flex flex-col items-center justify-center gap-px w-8 h-8 rounded-l transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          activeColor
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <TextColorIconSvg />
        <span
          className="block w-4 h-1 rounded-sm"
          style={{ backgroundColor: activeColor ?? lastColor }}
        />
      </button>

      {/* ── Dropdown-arrow button ── */}
      <button
        type="button"
        title="More text colors"
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
          aria-label="Text color picker"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-2.5 min-w-[168px]"
        >
          {/* Remove color */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyColor(null); }}
            className="flex items-center gap-2 w-full px-2 py-1.5 mb-2 text-sm rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <EraserIcon />
            <span>Remove color</span>
          </button>

          {/* Preset grid — 5 columns × 3 rows */}
          <div className="grid grid-cols-5 gap-1 mb-2">
            {PRESET_COLORS.map((c) => (
              <ColorSwatch
                key={c.value}
                color={c}
                isActive={activeColor?.toUpperCase() === c.value.toUpperCase()}
                onSelect={applyColor}
              />
            ))}
          </div>

          {/* Document colors — only non-preset colors found in the doc */}
          {extraDocColors.length > 0 && (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 px-1">
                Document colors
              </p>
              <div className="grid grid-cols-5 gap-1 mb-2">
                {extraDocColors.map((c) => (
                  <ColorSwatch
                    key={c}
                    color={{ label: c, value: c }}
                    isActive={activeColor?.toUpperCase() === c.toUpperCase()}
                    onSelect={applyColor}
                  />
                ))}
              </div>
            </>
          )}

          {/* Native color picker */}
          <button
            type="button"
            onMouseDown={openNativePicker}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <PaletteIcon />
            <span>Color picker</span>
          </button>

          {/* Hidden native color input */}
          <input
            ref={nativePickerRef}
            type="color"
            defaultValue={lastColor}
            onChange={handleNativePicker}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      )}
    </div>
  );
}

// ─── Color Swatch ─────────────────────────────────────────────────────────────

function ColorSwatch({
  color,
  isActive,
  onSelect,
}: {
  color: ColorOption;
  isActive: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      title={color.label}
      onMouseDown={(e) => { e.preventDefault(); onSelect(color.value); }}
      className={[
        'relative flex items-center justify-center w-7 h-7 rounded transition-transform',
        'hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500',
        isActive ? 'ring-2 ring-offset-1 ring-blue-500' : '',
        color.border ? 'border border-gray-300 dark:border-gray-500' : '',
      ].join(' ')}
      style={{ backgroundColor: color.value }}
    >
      {isActive && (
        <svg
          className="w-3.5 h-3.5 drop-shadow"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isLightColor(color.value) ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)'}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

/** Rough luminance check — use dark checkmark on light swatches, light on dark. */
function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function TextColorIconSvg() {
  return (
    <svg width="14" height="12" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 L12 4 L20 20" />
      <path d="M7.5 13 L16.5 13" />
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

function PaletteIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5"  cy="7.5"  r=".5" fill="currentColor" />
      <circle cx="6.5"  cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}
