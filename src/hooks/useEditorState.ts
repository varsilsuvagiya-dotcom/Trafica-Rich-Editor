/**
 * useEditorState
 *
 * Subscribes a React component to an EditorEngine and re-renders
 * whenever the state changes. This is the React integration layer.
 *
 * This hook uses React's useSyncExternalStore — the correct primitive
 * for subscribing to external mutable stores in React 18+.
 * It avoids the tearing issues of useEffect+setState patterns.
 */

'use client';

import { useSyncExternalStore } from 'react';
import type { EditorEngine } from '../editor/core/EditorEngine';
import type { EditorState } from '../types';

export function useEditorState(engine: EditorEngine): EditorState {
  return useSyncExternalStore(
    (onStoreChange) => engine.subscribe(() => onStoreChange()),
    () => engine.getState(),
    () => engine.getState(), // server snapshot (SSR)
  );
}
