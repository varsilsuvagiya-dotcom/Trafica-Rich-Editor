'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { setHighlightColor } from '../../editor/commands';

// ─── CKEditor 5-matching colour palette ───────────────────────────────────────
// Same hue/saturation grid CKEditor ships by default:
//   row 1 — neutral grey ramp
//   row 2 — warm spectrum  (hsl h=0..120, s=75%, l=60%)
//   row 3 — cool spectrum  (hsl h=150..270, s=75%, l=60%)

interface ColorOption {
  label: string;
  value: string; // lowercase hex
  hasBorder?: boolean;
}

const PRESET_COLORS: ColorOption[] = [
  // Row 1 — neutrals
  { label: 'Black',       value: '#000000' },
  { label: 'Dim grey',    value: '#4d4d4d' },
  { label: 'Grey',        value: '#999999' },
  { label: 'Light grey',  value: '#e6e6e6' },
  { label: 'White',       value: '#ffffff', hasBorder: true },
  // Row 2 — warm
  { label: 'Red',         value: '#e64d4d' },
  { label: 'Orange',      value: '#f99a4d' },
  { label: 'Yellow',      value: '#f9e04d' },
  { label: 'Light green', value: '#91e44d' },
  { label: 'Green',       value: '#54d454' },
  // Row 3 — cool
  { label: 'Aquamarine',  value: '#54d4a6' },
  { label: 'Turquoise',   value: '#54d4d4' },
  { label: 'Light blue',  value: '#4d91e4' },
  { label: 'Blue',        value: '#4d4de4' },
  { label: 'Purple',      value: '#9d4de4' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface BackgroundColorDropdownProps {
  engine: EditorEngine;
  activeColor: string | null;
  documentColors: string[];
}

export function BackgroundColorDropdown({
  engine,
  activeColor,
  documentColors,
}: BackgroundColorDropdownProps) {
  const [open, setOpen]           = useState(false);
  const [lastColor, setLastColor] = useState(PRESET_COLORS[6].value); // Yellow default
  const [hexInput, setHexInput]   = useState('');
  const [hexError, setHexError]   = useState(false);
  const containerRef              = useRef<HTMLDivElement>(null);

  // Outside-click → close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape → close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const applyColor = useCallback((color: string | null) => {
    if (color) setLastColor(normalizeHex(color));
    setHighlightColor(color)(engine);
    setOpen(false);
  }, [engine]);

  const handleQuickApply = () => {
    const norm = normalizeHex(lastColor);
    if (activeColor && normalizeHex(activeColor) === norm) {
      setHighlightColor(null)(engine);
    } else {
      setHighlightColor(norm)(engine);
    }
  };

  const commitHexInput = () => {
    const raw = hexInput.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(raw) || /^[0-9a-f]{3}$/i.test(raw)) {
      applyColor(`#${raw.toLowerCase()}`);
      setHexError(false);
    } else {
      setHexError(true);
    }
  };

  // Non-preset document colors
  const extraDocColors = documentColors.filter(
    (c) => !PRESET_COLORS.some((p) => normalizeHex(p.value) === normalizeHex(c)),
  );

  const normActive = activeColor ? normalizeHex(activeColor) : null;

  return (
    <div ref={containerRef} className="relative flex items-center">

      {/* ── Quick-apply split button ──────────────────────────────────────── */}
      <button
        type="button"
        title={`Background color: ${lastColor}`}
        onMouseDown={(e) => { e.preventDefault(); handleQuickApply(); }}
        className="flex flex-col items-center justify-center gap-0.5 w-8 h-8 rounded-l
                   text-gray-700 dark:text-gray-300
                   hover:bg-gray-100 dark:hover:bg-gray-700
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500
                   transition-colors"
      >
        <BgColorIcon />
        <ColorBar color={normActive ?? lastColor} />
      </button>

      {/* ── Chevron button ───────────────────────────────────────────────── */}
      <button
        type="button"
        title="More background colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => { e.preventDefault(); setOpen((p) => { if (!p) { setHexInput(''); setHexError(false); } return !p; }); }}
        className={[
          'flex items-center justify-center w-4 h-8 rounded-r border-l border-gray-200 dark:border-gray-600',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          'transition-colors',
          open
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <ChevronDownIcon />
      </button>

      {/* ── Dropdown panel ───────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="Background color"
          className="absolute top-full left-0 mt-1 z-50
                     bg-white dark:bg-gray-800
                     border border-gray-200 dark:border-gray-600
                     rounded-lg shadow-xl
                     p-3 w-[208px]"
        >
          {/* Remove background */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyColor(null); }}
            className="flex items-center gap-2 w-full px-2 py-1.5 mb-2.5 text-xs font-medium
                       text-gray-600 dark:text-gray-300
                       rounded hover:bg-gray-100 dark:hover:bg-gray-700
                       transition-colors"
          >
            <RemoveColorIcon />
            Remove background
          </button>

          {/* Separator */}
          <div className="h-px bg-gray-100 dark:bg-gray-700 mb-2.5" />

          {/* Document colors — non-preset colors already in doc */}
          {extraDocColors.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5 px-0.5">
                Document colors
              </p>
              <div className="grid grid-cols-5 gap-1 mb-2.5">
                {extraDocColors.slice(0, 10).map((c) => (
                  <Swatch
                    key={c}
                    color={{ label: c, value: c }}
                    isActive={normActive === normalizeHex(c)}
                    onSelect={applyColor}
                  />
                ))}
              </div>
              <div className="h-px bg-gray-100 dark:bg-gray-700 mb-2.5" />
            </>
          )}

          {/* Preset grid 5×3 */}
          <div className="grid grid-cols-5 gap-1 mb-3">
            {PRESET_COLORS.map((c) => (
              <Swatch
                key={c.value}
                color={c}
                isActive={normActive === normalizeHex(c.value)}
                onSelect={applyColor}
              />
            ))}
          </div>

          {/* Custom hex input — CKEditor-style inline, no native dialog */}
          <div className="h-px bg-gray-100 dark:bg-gray-700 mb-2.5" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5 px-0.5">
            Custom color
          </p>
          <div className="flex items-center gap-1.5">
            {/* Live color preview */}
            <div
              className="shrink-0 w-7 h-7 rounded border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: hexInputToPreview(hexInput) }}
            />
            <div className="flex flex-1 items-center border rounded overflow-hidden
                            border-gray-300 dark:border-gray-600
                            focus-within:ring-2 focus-within:ring-blue-500">
              <span className="pl-2 text-xs text-gray-400 select-none">#</span>
              <input
                type="text"
                maxLength={6}
                value={hexInput}
                onChange={(e) => {
                  setHexInput(e.target.value.replace(/[^0-9a-fA-F]/g, ''));
                  setHexError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitHexInput(); }
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="e.g. ffff00"
                className={[
                  'flex-1 px-1 py-1.5 text-xs bg-transparent outline-none font-mono',
                  'text-gray-900 dark:text-gray-100',
                  hexError ? 'text-red-500' : '',
                ].join(' ')}
                aria-label="Hex colour value"
              />
            </div>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitHexInput(); }}
              className="shrink-0 px-2 py-1.5 text-xs bg-blue-600 text-white rounded
                         hover:bg-blue-700 transition-colors"
            >
              ✓
            </button>
          </div>
          {hexError && (
            <p className="text-[10px] text-red-500 mt-1 px-0.5">Invalid hex colour</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Swatch ───────────────────────────────────────────────────────────────────

function Swatch({
  color,
  isActive,
  onSelect,
}: {
  color: ColorOption;
  isActive: boolean;
  onSelect: (v: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      title={color.label}
      onMouseDown={(e) => { e.preventDefault(); onSelect(color.value); }}
      className={[
        'relative w-[30px] h-[30px] rounded transition-transform',
        'hover:scale-110 focus:outline-none',
        'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500',
        isActive ? 'ring-2 ring-offset-1 ring-blue-500 scale-105' : '',
        color.hasBorder ? 'border border-gray-300 dark:border-gray-500' : '',
      ].join(' ')}
      style={{ backgroundColor: color.value }}
    >
      {isActive && <CheckIcon light={isLight(color.value)} />}
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

function hexInputToPreview(input: string): string {
  const raw = input.replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw}`;
  return 'transparent';
}

function isLight(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorBar({ color }: { color: string }) {
  return <span className="block w-4 h-[3px] rounded-sm" style={{ backgroundColor: color }} />;
}

function CheckIcon({ light }: { light: boolean }) {
  return (
    <svg
      className="absolute inset-0 m-auto w-3.5 h-3.5 drop-shadow"
      viewBox="0 0 24 24"
      fill="none"
      stroke={light ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.9)'}
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BgColorIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 24 22" fill="none" stroke="currentColor"
         strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 L12 4 L20 20" />
      <path d="M7.5 13 L16.5 13" />
      <rect x="2" y="18" width="20" height="3" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RemoveColorIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 21h14" />
      <path d="m5 11 9-9 7 7-9 9H5l-2-2 2-5Z" />
    </svg>
  );
}
