'use client';

import React from 'react';
import { ToolbarButton } from './ToolbarButton';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { useEditorState } from '../../hooks/useEditorState';
import { getActiveBlockType } from '../../editor/selection/SelectionEngine';
import { toggleCheckList } from '../../editor/commands';

interface ChecklistButtonProps {
  engine: EditorEngine;
}

export function ChecklistButton({ engine }: ChecklistButtonProps) {
  const state = useEditorState(engine);
  const activeBlock = getActiveBlockType(state.doc, state.selection);

  return (
    <ToolbarButton
      label="☑"
      title="Checklist (Ctrl+Shift+9)"
      onClick={() => toggleCheckList(engine)}
      isActive={activeBlock === 'check_list_item'}
      icon={<ChecklistIcon />}
    />
  );
}

function ChecklistIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <polyline points="4 8 6 10 9 6" />
      <line x1="13" y1="8" x2="21" y2="8" />
      <rect x="3" y="14" width="6" height="6" rx="1" />
      <line x1="13" y1="17" x2="21" y2="17" />
    </svg>
  );
}
