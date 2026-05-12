'use client';

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import type { EditorEngine } from '../editor/core/EditorEngine';
import { useEditorState } from '../hooks/useEditorState';
import {
  findMatches,
  applySearchHighlights,
  clearSearchHighlights,
  scrollMatchIntoView,
} from '../editor/search/SearchEngine';
import { replaceMatch, replaceAllMatches } from '../editor/search/SearchCommands';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FindReplaceModalProps {
  engine: EditorEngine;
  editorContainer: React.RefObject<HTMLDivElement | null>;
  initialMode: 'find' | 'replace';
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FindReplaceModal({
  engine,
  editorContainer,
  initialMode,
  onClose,
}: FindReplaceModalProps) {
  const state = useEditorState(engine);

  const [query,         setQuery]         = useState('');
  const [replacement,   setReplacement]   = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord,     setWholeWord]     = useState(false);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [mode,          setMode]          = useState<'find' | 'replace'>(initialMode);

  const findInputRef    = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // ── Compute matches whenever doc / query / options change ──────────────────

  const matches = useMemo(
    () => findMatches(state.doc, query, { caseSensitive, wholeWord }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.doc, query, caseSensitive, wholeWord],
  );

  // Safe index — clamps to valid range without needing an extra state update
  const safeIndex = matches.length > 0 ? Math.min(currentIndex, matches.length - 1) : 0;

  // Reset index to 0 when matches drop to zero (e.g. after Replace All)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (matches.length === 0) setCurrentIndex(0);
  }, [matches.length]);

  // ── Apply CSS Custom Highlights after each render ──────────────────────────
  // useEffect (not useLayoutEffect) so it runs AFTER Editor's useLayoutEffect
  // has already rebuilt the DOM, avoiding highlight flicker.

  useEffect(() => {
    const container = editorContainer.current;
    if (!container) return;
    applySearchHighlights(container, matches, safeIndex);
    return () => clearSearchHighlights();
  }, [matches, safeIndex, editorContainer]);

  // ── Scroll current match into view ─────────────────────────────────────────

  useEffect(() => {
    const container = editorContainer.current;
    if (!container || matches.length === 0) return;
    scrollMatchIntoView(container, matches[safeIndex]);
  }, [safeIndex, matches, editorContainer]);

  // ── Auto-focus the find input on mount ────────────────────────────────────

  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      // Ctrl/Cmd+F refocuses the find input
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setMode('find');
        findInputRef.current?.focus();
        findInputRef.current?.select();
        return;
      }
      // Ctrl/Cmd+H switches to replace mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setMode('replace');
        replaceInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────────

  const navigateNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const navigatePrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // ── Replace ───────────────────────────────────────────────────────────────

  function handleReplace() {
    if (matches.length === 0) return;
    replaceMatch(matches[safeIndex], replacement)(engine);
    // After state update, matches recompute; safeIndex naturally points to next match
  }

  function handleReplaceAll() {
    if (matches.length === 0) return;
    replaceAllMatches(matches, replacement)(engine);
  }

  // ── Close ─────────────────────────────────────────────────────────────────

  function handleClose() {
    clearSearchHighlights();
    onClose();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const hasQuery   = query.length > 0;
  const noResults  = hasQuery && matches.length === 0;
  const countLabel = hasQuery && matches.length > 0
    ? `${safeIndex + 1} / ${matches.length}`
    : null;

  return (
    <div
      role="dialog"
      aria-label="Find and replace"
      aria-modal="false"
      className="absolute top-12 right-64 z-50 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <SearchIcon />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Find and replace
          </span>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <XIcon />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* ── Find input ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={findInputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? navigatePrev() : navigateNext(); }
              }}
              placeholder="Find in text…"
              aria-label="Find"
              className={[
                'w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-700',
                'text-gray-900 dark:text-gray-100 placeholder-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                noResults
                  ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-gray-600',
              ].join(' ')}
            />
            {/* No results indicator */}
            {noResults && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-400 dark:text-red-400 pointer-events-none">
                Not found
              </span>
            )}
          </div>

          {/* Prev / Next / Count */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title="Previous (Shift+Enter)"
              onClick={navigatePrev}
              disabled={matches.length === 0}
              className="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUpIcon />
            </button>
            <button
              type="button"
              title="Next (Enter)"
              onClick={navigateNext}
              disabled={matches.length === 0}
              className="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDownIcon />
            </button>
            {countLabel && (
              <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[44px] text-center tabular-nums">
                {countLabel}
              </span>
            )}
          </div>
        </div>

        {/* ── Replace input ── */}
        <input
          ref={replaceInputRef}
          type="text"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleReplace(); }
          }}
          placeholder="Replace with…"
          aria-label="Replace with"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />

        {/* ── Advanced options ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
            <span>Advanced options</span>
          </button>

          {showAdvanced && (
            <div className="mt-2.5 flex items-center gap-5">
              <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => { setCaseSensitive(e.target.checked); setCurrentIndex(0); }}
                  className="w-3.5 h-3.5 accent-blue-600"
                />
                Match case
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wholeWord}
                  onChange={(e) => { setWholeWord(e.target.checked); setCurrentIndex(0); }}
                  className="w-3.5 h-3.5 accent-blue-600"
                />
                Whole words
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 rounded-b-xl">
        <button
          type="button"
          onClick={handleReplaceAll}
          disabled={matches.length === 0}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Replace all
        </button>
        <button
          type="button"
          onClick={handleReplace}
          disabled={matches.length === 0}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={navigateNext}
          disabled={matches.length === 0}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Find
        </button>
      </div>
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
