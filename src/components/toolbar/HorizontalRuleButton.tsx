'use client';

import React from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { insertHorizontalRule } from '../../editor/commands';
import { ToolbarButton } from './ToolbarButton';

interface HorizontalRuleButtonProps {
  engine: EditorEngine;
}

export function HorizontalRuleButton({ engine }: HorizontalRuleButtonProps) {
  return (
    <ToolbarButton
      label="HR"
      title="Insert Horizontal Rule"
      onClick={() => insertHorizontalRule(engine)}
      icon={<HRIcon />}
    />
  );
}

function HRIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="7"  x2="9"  y2="7"  strokeWidth={1.5} strokeOpacity={0.5} />
      <line x1="3" y1="17" x2="9"  y2="17" strokeWidth={1.5} strokeOpacity={0.5} />
    </svg>
  );
}
