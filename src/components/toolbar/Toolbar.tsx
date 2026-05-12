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
import { ImageUploadButton } from './ImageUploadButton';
import { undo, redo } from '../../editor/history/HistoryManager';

interface ToolbarProps {
  engine: EditorEngine;
  onFindReplace?: (mode: 'find' | 'replace') => void;
  /** When true, the link popup opens immediately (driven by Ctrl+K from Editor) */
  linkPopupOpen?: boolean;
  onLinkPopupClose?: () => void;
}

export function Toolbar({ engine, onFindReplace, linkPopupOpen, onLinkPopupClose }: ToolbarProps) {
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
        externalOpen={linkPopupOpen}
        onExternalClose={onLinkPopupClose}
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
      <ImageUploadButton engine={engine} />

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
  externalOpen,
  onExternalClose,
}: {
  engine: EditorEngine;
  isActive: boolean;
  activeHref: string | null;
  hasTextSelected: boolean;
  /** Ctrl+K from Editor drives this to true */
  externalOpen?: boolean;
  onExternalClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [url, setUrl] = useState('');
  const [displayText, setDisplayText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const openPopup = () => {
    if (isActive) {
      setUrl(activeHref ?? '');
      setDisplayText('');
      setEditMode(true);      // editing existing link → straight to edit
    } else {
      setUrl('');
      setDisplayText('');
      setEditMode(true);      // inserting new link → edit mode
    }
    setOpen(true);
  };

  const closePopup = () => {
    setOpen(false);
    setEditMode(false);
    setUrl('');
    setDisplayText('');
    onExternalClose?.();
  };

  // Ctrl+K external trigger — open popup from keyboard shortcut
  useEffect(() => {
    if (!externalOpen) return;
    const t = setTimeout(() => {
      setUrl(isActive ? (activeHref ?? '') : '');
      setDisplayText('');
      setEditMode(true);
      setOpen(true);
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePopup();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-focus URL field whenever edit mode opens
  useEffect(() => {
    if (open && editMode) {
      // Small defer so the popup is in the DOM before focus
      setTimeout(() => urlInputRef.current?.focus(), 0);
    }
  }, [open, editMode]);

  const handleToolbarClick = () => {
    if (open) { closePopup(); return; }
    openPopup();
  };

  const handleApply = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    // displayText only used when collapsed with no selection
    const text = displayText.trim() || undefined;
    insertLink(href, text)(engine);
    closePopup();
  };

  const handleRemove = () => {
    removeLink(engine);
    closePopup();
  };

  const handleStartEdit = () => {
    setUrl(activeHref ?? '');
    setDisplayText('');
    setEditMode(true);
  };

  // Show "Display text" field only when cursor is collapsed and no text is selected
  // (i.e. user is inserting a brand-new link with custom anchor text)
  const showTextInput = !hasTextSelected && !isActive;

  return (
    <div ref={containerRef} className="relative">
      <ToolbarButton
        label="link"
        title="Link (Ctrl+K)"
        onClick={handleToolbarClick}
        isActive={isActive || open}
        icon={<LinkIcon />}
      />

      {open && (
        <div
          role="dialog"
          aria-label="Link editor"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3 w-80"
        >
          {/* ── Preview mode: cursor sits on an existing link ── */}
          {isActive && !editMode ? (
            <>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wide">
                Link
              </p>
              <div className="flex items-center gap-2 min-w-0">
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
                  onMouseDown={(e) => { e.preventDefault(); handleStartEdit(); }}
                  className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Edit link"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleRemove(); }}
                  className="shrink-0 text-xs text-red-500 dark:text-red-400 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  aria-label="Remove link"
                >
                  Remove
                </button>
              </div>
            </>
          ) : (
            /* ── Edit / Insert mode ── */
            <>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wide">
                {isActive ? 'Edit link' : 'Insert link'}
              </p>

              {/* Display text — only shown when inserting at collapsed cursor */}
              {showTextInput && (
                <div className="mb-2">
                  <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                    Display text
                  </label>
                  <input
                    ref={textInputRef}
                    type="text"
                    value={displayText}
                    onChange={(e) => setDisplayText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); urlInputRef.current?.focus(); }
                      if (e.key === 'Escape') closePopup();
                    }}
                    placeholder="Link text"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* URL field */}
              <div className="mb-3">
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                  URL
                </label>
                <input
                  ref={urlInputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
                    if (e.key === 'Escape') closePopup();
                  }}
                  placeholder="https://example.com"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleApply(); }}
                  disabled={!url.trim() || (showTextInput && !displayText.trim() && !hasTextSelected && !isActive)}
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isActive ? 'Update' : 'Insert'}
                </button>
                {isActive && (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleRemove(); }}
                    className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); closePopup(); }}
                  className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  aria-label="Cancel"
                >
                  ✕
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
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.33333 6.66672L2.74417 7.25589L2.155 6.66672L2.74417 6.07756L3.33333 6.66672ZM7.5 16.6667C7.27899 16.6667 7.06702 16.5789 6.91074 16.4226C6.75446 16.2664 6.66667 16.0544 6.66667 15.8334C6.66667 15.6124 6.75446 15.4004 6.91074 15.2441C7.06702 15.0879 7.27899 15.0001 7.5 15.0001V16.6667ZM6.91083 11.4226L2.74417 7.25589L3.9225 6.07756L8.08917 10.2442L6.91083 11.4226ZM2.74417 6.07756L6.91083 1.91089L8.08917 3.08922L3.9225 7.25589L2.74417 6.07756ZM3.33333 5.83339H12.0833V7.50005H3.33333V5.83339ZM12.0833 16.6667H7.5V15.0001H12.0833V16.6667ZM17.5 11.2501C17.5 12.6866 16.9293 14.0644 15.9135 15.0802C14.8977 16.096 13.5199 16.6667 12.0833 16.6667V15.0001C12.5758 15.0001 13.0634 14.9031 13.5184 14.7146C13.9734 14.5261 14.3868 14.2499 14.735 13.9017C15.0832 13.5535 15.3594 13.1401 15.5479 12.6851C15.7363 12.2301 15.8333 11.7425 15.8333 11.2501H17.5ZM12.0833 5.83339C13.5199 5.83339 14.8977 6.40407 15.9135 7.41989C16.9293 8.43572 17.5 9.81347 17.5 11.2501H15.8333C15.8333 10.7576 15.7363 10.27 15.5479 9.81499C15.3594 9.36002 15.0832 8.94662 14.735 8.5984C14.3868 8.25019 13.9734 7.97396 13.5184 7.78551C13.0634 7.59705 12.5758 7.50005 12.0833 7.50005V5.83339Z"
        fill="black"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16.6667 6.66672L17.2558 7.25589L17.845 6.66672L17.2558 6.07756L16.6667 6.66672ZM12.5 16.6667C12.721 16.6667 12.933 16.5789 13.0893 16.4226C13.2455 16.2664 13.3333 16.0544 13.3333 15.8334C13.3333 15.6124 13.2455 15.4004 13.0893 15.2441C12.933 15.0879 12.721 15.0001 12.5 15.0001V16.6667ZM13.0892 11.4226L17.2558 7.25589L16.0775 6.07756L11.9108 10.2442L13.0892 11.4226ZM17.2558 6.07756L13.0892 1.91089L11.9108 3.08922L16.0775 7.25589L17.2558 6.07756ZM16.6667 5.83339H7.91667V7.50005H16.6667V5.83339ZM7.91667 16.6667H12.5V15.0001H7.91667V16.6667ZM2.5 11.2501C2.5 12.6866 3.07068 14.0644 4.0865 15.0802C5.10233 16.096 6.48008 16.6667 7.91667 16.6667V15.0001C7.42421 15.0001 6.93657 14.9031 6.4816 14.7146C6.02663 14.5261 5.61322 14.2499 5.26501 13.9017C4.9168 13.5535 4.64057 13.1401 4.45211 12.6851C4.26366 12.2301 4.16667 11.7425 4.16667 11.2501H2.5ZM7.91667 5.83339C6.48008 5.83339 5.10233 6.40407 4.0865 7.41989C3.07068 8.43572 2.5 9.81347 2.5 11.2501H4.16667C4.16667 10.7576 4.26366 10.27 4.45211 9.81499C4.64057 9.36002 4.9168 8.94662 5.26501 8.5984C5.61322 8.25019 6.02663 7.97396 6.4816 7.78551C6.93657 7.59705 7.42421 7.50005 7.91667 7.50005V5.83339Z"
        fill="black"
      />
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
