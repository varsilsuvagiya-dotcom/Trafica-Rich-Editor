'use client';

import React from 'react';

interface ToolbarButtonProps {
  label: string;
  title: string;
  onClick: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  icon?: React.ReactNode;
}

export function ToolbarButton({
  label,
  title,
  onClick,
  isActive = false,
  isDisabled = false,
  icon,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      disabled={isDisabled}
      onMouseDown={(e) => {
        // Prevent the editor from losing focus on toolbar click
        e.preventDefault();
        if (!isDisabled) onClick();
      }}
      className={[
        'flex items-center justify-center w-8 h-8 rounded text-sm font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        isActive
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {icon ?? label}
    </button>
  );
}
