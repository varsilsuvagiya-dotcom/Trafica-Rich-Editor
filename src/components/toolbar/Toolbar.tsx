'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ToolbarButton } from './ToolbarButton';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { useEditorState } from '../../hooks/useEditorState';
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  toggleCode,
  toggleBulletList,
  toggleOrderedList,
  setHeading,
  setParagraph,
  setBlockquote,
  setCodeBlock,
  insertLink,
  removeLink,
} from '../../editor/commands';
import { getActiveMarks, getActiveBlockType, getActiveLinkHref, getActiveAlignment, getActiveFontSize, getActiveFontFamily, getActiveHighlightColor, getActiveTextColor } from '../../editor/selection/SelectionEngine';
import { getDocumentMarkAttrValues } from '../../editor/core/DocumentModel';
import { AlignmentDropdown } from './AlignmentDropdown';
import { FontSizeDropdown } from './FontSizeDropdown';
import { FontFamilyDropdown } from './FontFamilyDropdown';
import { BackgroundColorDropdown } from './BackgroundColorDropdown';
import { TextColorDropdown } from './TextColorDropdown';
import { HorizontalRuleButton } from './HorizontalRuleButton';
import { ChecklistButton } from './ChecklistButton';
import { TableButton } from './TableButton';
import { undo, redo } from '../../editor/history/HistoryManager';

interface ToolbarProps {
  engine: EditorEngine;
  onInsertImage?: () => void;
  onFindReplace?: (mode: 'find' | 'replace') => void;
}

export function Toolbar({ engine, onInsertImage, onFindReplace }: ToolbarProps) {
  const state = useEditorState(engine);
  const { doc, selection, marks } = state;

  // For collapsed cursors use pending marks (what next typed char will have).
  // For expanded selections use the marks on the selected text nodes.
  const activeMarks = (selection && !selection.isCollapsed)
    ? getActiveMarks(doc, selection)
    : new Set(marks.map((m) => m.type));
  const activeBlock = getActiveBlockType(doc, selection);
  const activeLinkHref = getActiveLinkHref(doc, selection, marks);
  const activeAlignment = getActiveAlignment(doc, selection);
  const activeFontSize = getActiveFontSize(doc, selection, marks);
  const activeFontFamily = getActiveFontFamily(doc, selection, marks);
  const activeHighlightColor = getActiveHighlightColor(doc, selection, marks);
  const activeTextColor = getActiveTextColor(doc, selection, marks);
  const documentTextColors = getDocumentMarkAttrValues(doc, 'text_color', 'color');
  const documentHighlightColors = getDocumentMarkAttrValues(doc, 'highlight', 'color');

  const run = (command: (e: typeof engine) => boolean) => command(engine);

  return (
    <div
      role="toolbar"
      aria-label="Editor formatting toolbar"
      className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 select-none"
    >
      {/* Undo / Redo */}
      <ToolbarButton
        label="↩"
        title="Undo (Ctrl+Z)"
        onClick={() => undo(engine)}
        icon={<UndoIcon />}
      />
      <ToolbarButton
        label="↪"
        title="Redo (Ctrl+Y)"
        onClick={() => redo(engine)}
        icon={<RedoIcon />}
      />

      <Divider />

      {/* Headings */}
      <HeadingDropdown engine={engine} activeBlock={activeBlock} />

      <Divider />

      {/* Inline Marks */}
      <ToolbarButton
        label="B"
        title="Bold (Ctrl+B)"
        onClick={() => run(toggleBold)}
        isActive={activeMarks.has('bold')}
        icon={<span className="font-bold text-sm">B</span>}
      />
      <ToolbarButton
        label="I"
        title="Italic (Ctrl+I)"
        onClick={() => run(toggleItalic)}
        isActive={activeMarks.has('italic')}
        icon={<span className="italic text-sm">I</span>}
      />
      <ToolbarButton
        label="U"
        title="Underline (Ctrl+U)"
        onClick={() => run(toggleUnderline)}
        isActive={activeMarks.has('underline')}
        icon={<span className="underline text-sm">U</span>}
      />
      <ToolbarButton
        label="S"
        title="Strikethrough"
        onClick={() => run(toggleStrikethrough)}
        isActive={activeMarks.has('strikethrough')}
        icon={<span className="line-through text-sm">S</span>}
      />
      <ToolbarButton
        label="`"
        title="Inline Code"
        onClick={() => run(toggleCode)}
        isActive={activeMarks.has('code')}
        icon={<CodeIcon />}
      />
      <LinkButton
        engine={engine}
        isActive={activeMarks.has('link')}
        activeHref={activeLinkHref}
        hasTextSelected={!!(selection && !selection.isCollapsed)}
      />
      <BackgroundColorDropdown engine={engine} activeColor={activeHighlightColor} documentColors={documentHighlightColors} />
      <TextColorDropdown
        engine={engine}
        activeColor={activeTextColor}
        documentColors={documentTextColors}
      />

      <Divider />

      {/* Font Family */}
      <FontFamilyDropdown engine={engine} activeFontFamily={activeFontFamily} />

      <Divider />

      {/* Font Size */}
      <FontSizeDropdown engine={engine} activeFontSize={activeFontSize} />

      <Divider />

      {/* Alignment */}
      <AlignmentDropdown engine={engine} activeAlignment={activeAlignment} />

      <Divider />

      {/* Lists */}
      <ToolbarButton
        label="UL"
        title="Bullet List"
        onClick={() => run(toggleBulletList)}
        isActive={activeBlock === 'bullet_list'}
        icon={<BulletListIcon />}
      />
      <ToolbarButton
        label="OL"
        title="Ordered List"
        onClick={() => run(toggleOrderedList)}
        isActive={activeBlock === 'ordered_list'}
        icon={<OrderedListIcon />}
      />
      <ChecklistButton engine={engine} />

      <Divider />

      {/* Blocks */}
      <ToolbarButton
        label="❝"
        title="Blockquote"
        onClick={() => run(setBlockquote)}
        isActive={activeBlock === 'blockquote'}
        icon={<BlockquoteIcon />}
      />
      <ToolbarButton
        label="</>"
        title="Code Block"
        onClick={() => run(setCodeBlock)}
        isActive={activeBlock === 'code_block'}
        icon={<CodeBlockIcon />}
      />

      <HorizontalRuleButton engine={engine} />
      <TableButton engine={engine} />

      <Divider />

      {/* Image */}
      {onInsertImage && (
        <ToolbarButton
          label="🖼"
          title="Insert Image"
          onClick={onInsertImage}
          icon={<ImageIcon />}
        />
      )}

      {onFindReplace && (
        <>
          <Divider />
          <ToolbarButton
            label="Find"
            title="Find and Replace (Ctrl+F)"
            onClick={() => onFindReplace('find')}
            icon={<FindReplaceIcon />}
          />
        </>
      )}
    </div>
  );
}

// ─── Heading Dropdown ─────────────────────────────────────────────────────────

function HeadingDropdown({
  engine,
  activeBlock,
}: {
  engine: EditorEngine;
  activeBlock: string;
}) {
  const run = (command: (e: typeof engine) => boolean) => command(engine);

  const BLOCK_LABELS: Record<string, string> = {
    paragraph: 'Paragraph',
    'heading-1': 'Heading 1',
    'heading-2': 'Heading 2',
    'heading-3': 'Heading 3',
    'heading-4': 'Heading 4',
    'heading-5': 'Heading 5',
    'heading-6': 'Heading 6',
    blockquote: 'Quote',
    code_block: 'Code',
  };
  const label = BLOCK_LABELS[activeBlock] ?? 'Paragraph';

  return (
    <div className="relative group">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        className="flex items-center gap-1 px-2 h-8 rounded text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
      >
        <span className="min-w-[72px] text-left">{label}</span>
        <span className="text-xs">▾</span>
      </button>

      <div className="absolute top-full left-0 mt-0.5 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 hidden group-focus-within:block group-hover:block">
        {[
          { label: 'Paragraph',  cmd: setParagraph,  active: activeBlock === 'paragraph' },
          { label: 'Heading 1',  cmd: setHeading(1), active: activeBlock === 'heading-1' },
          { label: 'Heading 2',  cmd: setHeading(2), active: activeBlock === 'heading-2' },
          { label: 'Heading 3',  cmd: setHeading(3), active: activeBlock === 'heading-3' },
          { label: 'Heading 4',  cmd: setHeading(4), active: activeBlock === 'heading-4' },
          { label: 'Heading 5',  cmd: setHeading(5), active: activeBlock === 'heading-5' },
          { label: 'Heading 6',  cmd: setHeading(6), active: activeBlock === 'heading-6' },
        ].map(({ label, cmd, active }) => (
          <button
            key={label}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(cmd);
            }}
            className={[
              'w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
              active ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Link Button ──────────────────────────────────────────────────────────────

function LinkButton({
  engine,
  isActive,
  activeHref,
  hasTextSelected,
}: {
  engine: EditorEngine;
  isActive: boolean;
  activeHref: string | null;
  hasTextSelected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [url, setUrl] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditMode(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus input only in edit mode
  useEffect(() => {
    if (open && editMode) inputRef.current?.focus();
  }, [open, editMode]);

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      setEditMode(false);
      return;
    }
    if (isActive) {
      // Cursor is on a link → show preview first
      setEditMode(false);
    } else {
      // No active link → go straight to edit mode
      setUrl('');
      setEditMode(true);
    }
    setOpen(true);
  };

  const handleApply = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    insertLink(href)(engine);
    setOpen(false);
    setEditMode(false);
  };

  const handleRemove = () => {
    removeLink(engine);
    setOpen(false);
    setEditMode(false);
  };

  const handleEdit = () => {
    setUrl(activeHref ?? '');
    setEditMode(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <ToolbarButton
        label="link"
        title="Link (Ctrl+K)"
        onClick={handleOpen}
        isActive={isActive}
        icon={<LinkIcon />}
      />
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 w-80">
          {/* Preview mode: cursor is on a link, not in edit mode */}
          {isActive && !editMode ? (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Link</p>
              <div className="flex items-center gap-2">
                <a
                  href={activeHref ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
                  title={activeHref ?? ''}
                >
                  {activeHref}
                </a>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleEdit(); }}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleRemove(); }}
                  className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 whitespace-nowrap"
                >
                  Remove
                </button>
              </div>
            </>
          ) : (
            /* Edit mode: type/paste URL */
            <>
              {!hasTextSelected && !isActive && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Select text first to apply a link
                </p>
              )}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
                    if (e.key === 'Escape') { setOpen(false); setEditMode(false); }
                  }}
                  placeholder="https://example.com"
                  disabled={!hasTextSelected && !isActive}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleApply(); }}
                  disabled={!hasTextSelected && !isActive}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Separator ────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1" aria-hidden="true" />;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function UndoIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 7v6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13A9 9 0 1 0 5.5 6L3 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 7v6h-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13A9 9 0 1 1 18.5 6L21 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="16 18 22 12 16 6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="8 6 2 12 8 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="9" y1="6" x2="20" y2="6" strokeLinecap="round" />
      <line x1="9" y1="12" x2="20" y2="12" strokeLinecap="round" />
      <line x1="9" y1="18" x2="20" y2="18" strokeLinecap="round" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="10" y1="6" x2="21" y2="6" strokeLinecap="round" />
      <line x1="10" y1="12" x2="21" y2="12" strokeLinecap="round" />
      <line x1="10" y1="18" x2="21" y2="18" strokeLinecap="round" />
      <text x="2" y="7" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">1</text>
      <text x="2" y="13" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">2</text>
      <text x="2" y="19" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">3</text>
    </svg>
  );
}

function BlockquoteIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </svg>
  );
}

function CodeBlockIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M9 9l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 9l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FindReplaceIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6" />
      <line x1="14.5" y1="14.5" x2="20" y2="20" />
      <path d="M7 10h6" />
      <path d="M10 7v6" />
    </svg>
  );
}
