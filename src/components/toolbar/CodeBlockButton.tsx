'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import type { BlockNode } from '../../types';
import { useEditorState } from '../../hooks/useEditorState';
import { getActiveBlockType } from '../../editor/selection/SelectionEngine';
import { findContentBlockPath, getNodeAtPath } from '../../editor/core/DocumentModel';
import { setCodeBlock, setCodeBlockLanguage } from '../../editor/commands';

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'plaintext',  label: 'Plain text'  },
  { value: 'c',          label: 'C'           },
  { value: 'cs',         label: 'C#'          },
  { value: 'cpp',        label: 'C++'         },
  { value: 'css',        label: 'CSS'         },
  { value: 'diff',       label: 'Diff'        },
  { value: 'go',         label: 'Go'          },
  { value: 'html',       label: 'HTML'        },
  { value: 'java',       label: 'Java'        },
  { value: 'javascript', label: 'JavaScript'  },
  { value: 'json',       label: 'JSON'        },
  { value: 'php',        label: 'PHP'         },
  { value: 'python',     label: 'Python'      },
  { value: 'sql',        label: 'SQL'         },
  { value: 'typescript', label: 'TypeScript'  },
  { value: 'xml',        label: 'XML'         },
];

interface CodeBlockButtonProps {
  engine: EditorEngine;
}

export function CodeBlockButton({ engine }: CodeBlockButtonProps) {
  const state = useEditorState(engine);
  const activeBlock = getActiveBlockType(state.doc, state.selection);
  const isActive = activeBlock === 'code_block';

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = (() => {
    if (!isActive || !state.selection) return 'plaintext';
    const bp = findContentBlockPath(state.doc, state.selection.anchor.path);
    if (!bp) return 'plaintext';
    const block = getNodeAtPath(state.doc, bp) as BlockNode | null;
    return (block?.attrs?.language as string) || 'plaintext';
  })();

  const closeDropdown = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDropdown(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closeDropdown]);

  const handleToggle = () => {
    setCodeBlock(engine);
    setOpen(false);
  };

  const handleSelectLanguage = (lang: string) => {
    if (!isActive) {
      setCodeBlock(engine);
      // Language set after block creation via timeout so state updates first.
      setTimeout(() => setCodeBlockLanguage(lang)(engine), 0);
    } else {
      setCodeBlockLanguage(lang)(engine);
    }
    setOpen(false);
  };

  const activeLang = LANGUAGES.find((l) => l.value === currentLang);

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Main toggle button */}
      <button
        type="button"
        title="Code Block (Ctrl+Shift+C)"
        onMouseDown={(e) => { e.preventDefault(); handleToggle(); }}
        className={[
          'flex items-center justify-center w-8 h-8 rounded-l text-sm transition-colors',
          isActive
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <CodeBlockIcon />
      </button>

      {/* Chevron / language selector */}
      <button
        type="button"
        title={isActive ? `Language: ${activeLang?.label ?? 'Plain text'}` : 'Select language'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        className={[
          'flex items-center justify-center w-4 h-8 rounded-r border-l border-gray-200 dark:border-gray-600 transition-colors',
          open
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
        ].join(' ')}
      >
        <ChevronIcon />
      </button>

      {/* Language dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label="Code block language"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 w-44 max-h-72 overflow-y-auto"
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Language
          </p>
          {LANGUAGES.map((lang) => {
            const isSelected = isActive && currentLang === lang.value;
            return (
              <button
                key={lang.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => { e.preventDefault(); handleSelectLanguage(lang.value); }}
                className={[
                  'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                {isSelected && (
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="currentColor">
                    <polyline points="1 6 4.5 9.5 11 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span className={isSelected ? '' : 'ml-5'}>{lang.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CodeBlockIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M9 9l-3 3 3 3" />
      <path d="M15 9l3 3-3 3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
