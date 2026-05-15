'use client';

import React from 'react';

interface SourceEditingButtonProps {
  isActive: boolean;
  onToggle: () => void;
}

export function SourceEditingButton({ isActive, onToggle }: SourceEditingButtonProps) {
  return (
    <button
      type="button"
      title="Source editing (HTML)"
      aria-pressed={isActive}
      onMouseDown={(e) => { e.preventDefault(); onToggle(); }}
      className={[
        'flex items-center justify-center w-8 h-8 rounded text-sm font-mono font-bold transition-colors',
        isActive
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
      ].join(' ')}
    >
      <SourceIcon />
    </button>
  );
}

function SourceIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
      <line x1="12" y1="3" x2="12" y2="21" strokeWidth={1.5} strokeOpacity={0.5} />
    </svg>
  );
}
