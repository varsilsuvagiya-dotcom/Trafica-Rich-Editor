/**
 * useEditorEngine
 *
 * Creates and manages an EditorEngine instance for the lifetime of the
 * component that mounts the editor. Registers built-in plugins.
 *
 * Usage:
 *   const engine = useEditorEngine();
 *   // Pass engine to <EditorCanvas engine={engine} />
 */

'use client';

import { useMemo } from 'react';
import { createEditorEngine } from '../editor/core/EditorEngine';
import { createHistoryManager } from '../editor/history/HistoryManager';
import { defaultKeyboardPlugin } from '../editor/commands';
import { TablePlugin } from '../editor/table/TablePlugin';
import type { EditorState } from '../types';

export function useEditorEngine(initialState?: Partial<EditorState>) {
  const engine = useMemo(() => {
    const e = createEditorEngine(initialState);
    e.registerPlugin(createHistoryManager());
    e.registerPlugin(defaultKeyboardPlugin);
    e.registerPlugin(TablePlugin);
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return engine;
}
