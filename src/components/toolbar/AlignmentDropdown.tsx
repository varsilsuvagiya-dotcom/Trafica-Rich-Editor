'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import type { AlignmentType } from '../../types';
import { setAlignment } from '../../editor/commands';

// ─── Config ───────────────────────────────────────────────────────────────────

interface AlignmentOption {
  value: AlignmentType;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const OPTIONS: AlignmentOption[] = [
  {
    value: 'left',
    label: 'Align Left',
    shortcut: 'Ctrl+Shift+L',
    icon: <AlignLeftIcon />,
  },
  {
    value: 'center',
    label: 'Align Center',
    shortcut: 'Ctrl+Shift+E',
    icon: <AlignCenterIcon />,
  },
  {
    value: 'right',
    label: 'Align Right',
    shortcut: 'Ctrl+Shift+R',
    icon: <AlignRightIcon />,
  },
  {
    value: 'justify',
    label: 'Justify',
    shortcut: 'Ctrl+Shift+J',
    icon: <AlignJustifyIcon />,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface AlignmentDropdownProps {
  engine: EditorEngine;
  activeAlignment: AlignmentType;
}

export function AlignmentDropdown({ engine, activeAlignment }: AlignmentDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const activeOption = OPTIONS.find((o) => o.value === activeAlignment) ?? OPTIONS[0];

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger: current-alignment icon + chevron */}
      <button
        type="button"
        title={`Text alignment (${activeOption.label})`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault(); // keep editor focus
          setOpen((prev) => !prev);
        }}
        className={[
          'flex items-center gap-0.5 px-1.5 h-8 rounded text-sm font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          open
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        {activeOption.icon}
        <ChevronDownIcon />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label="Text alignment"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[168px]"
        >
          {OPTIONS.map((option) => {
            const isActive = activeAlignment === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                title={`${option.label} (${option.shortcut})`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setAlignment(option.value)(engine);
                  setOpen(false);
                }}
                className={[
                  'w-full flex items-center gap-3 px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                <span className="flex-shrink-0">{option.icon}</span>
                <span className="flex-1 text-left">{option.label}</span>
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

function AlignLeftIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="10" x2="15" y2="10" />
      <line x1="3" y1="14" x2="21" y2="14" />
      <line x1="3" y1="18" x2="15" y2="18" />
    </svg>
  );
}

function AlignCenterIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="6" y1="10" x2="18" y2="10" />
      <line x1="3" y1="14" x2="21" y2="14" />
      <line x1="6" y1="18" x2="18" y2="18" />
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3"  y1="6"  x2="21" y2="6" />
      <line x1="9"  y1="10" x2="21" y2="10" />
      <line x1="3"  y1="14" x2="21" y2="14" />
      <line x1="9"  y1="18" x2="21" y2="18" />
    </svg>
  );
}

function AlignJustifyIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="14" x2="21" y2="14" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

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
