'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { setImageAttr, deleteImageAtPath } from '../../editor/commands';

interface ImageToolbarProps {
  engine: EditorEngine;
  imagePath: number[];
  editorContainer: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export function ImageToolbar({ engine, imagePath, editorContainer, onClose }: ImageToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionInput, setCaptionInput] = useState('');

  const state = engine.getState();
  const imageNode = (() => {
    let node: unknown = state.doc;
    for (const idx of imagePath) {
      node = (node as { children: unknown[] }).children?.[idx];
      if (!node) return null;
    }
    return node as { attrs: Record<string, unknown> };
  })();

  const currentAlign = (imageNode?.attrs?.align as string) ?? 'none';
  const hasCaption   = imageNode?.attrs?.caption !== undefined;

  useLayoutEffect(() => {
    const container = editorContainer.current;
    const toolbar   = toolbarRef.current;
    if (!container || !toolbar) return;

    const fig = container.querySelector(
      `[data-image-path="${JSON.stringify(imagePath)}"]`,
    ) as HTMLElement | null;
    if (!fig) return;

    const rect      = fig.getBoundingClientRect();
    const toolbarH  = toolbar.offsetHeight || 36;
    const top       = Math.max(4, rect.top - toolbarH - 6);
    toolbar.style.top        = `${top}px`;
    toolbar.style.left       = `${rect.left}px`;
    toolbar.style.minWidth   = `${rect.width}px`;
    toolbar.style.visibility = 'visible';
  });

  const run = (attrs: Record<string, unknown>) => {
    setImageAttr(imagePath, attrs)(engine);
  };

  const handleDelete = () => {
    deleteImageAtPath(imagePath)(engine);
    onClose();
  };

  const commitCaption = () => {
    run({ caption: captionInput });
    setCaptionOpen(false);
  };

  const removeCaption = () => {
    // Remove caption attr by setting undefined — spread will drop it
    const s = engine.getState();
    let node: unknown = s.doc;
    for (const idx of imagePath) {
      node = (node as { children: unknown[] }).children?.[idx];
    }
    if (!node) return;
    const n = node as { type: string; attrs: Record<string, unknown>; children: unknown[] };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { caption: _caption, ...restAttrs } = n.attrs;
    const tr = { steps: [
      { type: 'delete_node' as const, path: imagePath },
      { type: 'insert_node' as const, parentPath: imagePath.slice(0, -1), index: imagePath[imagePath.length - 1], node: { ...n, attrs: restAttrs } },
    ], meta: {} };
    engine.dispatch(tr as Parameters<typeof engine.dispatch>[0]);
    setCaptionOpen(false);
  };

  return (
    <>
      <div
        ref={toolbarRef}
        style={{ position: 'fixed', visibility: 'hidden', zIndex: 9100 }}
        onMouseDown={(e) => e.preventDefault()}
        className="flex items-center gap-px rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-lg dark:border-gray-600 dark:bg-gray-800"
      >
        {/* Alignment */}
        <Btn title="Align left"   active={currentAlign === 'left'}   onClick={() => run({ align: 'left' })}>   <AlignLeftIcon />   </Btn>
        <Btn title="Align center" active={currentAlign === 'center'} onClick={() => run({ align: 'center' })}> <AlignCenterIcon /> </Btn>
        <Btn title="Align right"  active={currentAlign === 'right'}  onClick={() => run({ align: 'right' })}>  <AlignRightIcon />  </Btn>

        <Sep />

        {/* Caption */}
        <Btn
          title={hasCaption ? 'Edit caption' : 'Add caption'}
          active={hasCaption}
          onClick={() => {
            setCaptionInput((imageNode?.attrs?.caption as string) ?? '');
            setCaptionOpen((v) => !v);
          }}
        >
          <CaptionIcon />
        </Btn>

        <Sep />

        {/* Delete */}
        <Btn title="Delete image" danger onClick={handleDelete}>
          <DeleteIcon />
        </Btn>
      </div>

      {/* Caption editor popover */}
      {captionOpen && (
        <CaptionPopover
          value={captionInput}
          hasCaption={hasCaption}
          onChange={setCaptionInput}
          onCommit={commitCaption}
          onRemove={removeCaption}
          onCancel={() => setCaptionOpen(false)}
          imagePath={imagePath}
          editorContainer={editorContainer}
        />
      )}
    </>
  );
}

// ─── Caption popover ──────────────────────────────────────────────────────────

function CaptionPopover({
  value, hasCaption, onChange, onCommit, onRemove, onCancel, imagePath, editorContainer,
}: {
  value: string;
  hasCaption: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
  onRemove: () => void;
  onCancel: () => void;
  imagePath: number[];
  editorContainer: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = editorContainer.current;
    const el = ref.current;
    if (!container || !el) return;
    const fig = container.querySelector(
      `[data-image-path="${JSON.stringify(imagePath)}"]`,
    ) as HTMLElement | null;
    if (!fig) return;
    const rect = fig.getBoundingClientRect();
    el.style.top  = `${rect.bottom + 6}px`;
    el.style.left = `${rect.left}px`;
    el.style.visibility = 'visible';
  });

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', visibility: 'hidden', zIndex: 9200 }}
      onMouseDown={(e) => e.stopPropagation()}
      className="w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
        Image caption
      </p>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Enter caption…"
        className="w-full px-2.5 py-1.5 text-xs rounded border outline-none
                   border-gray-300 dark:border-gray-600
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                   focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="flex justify-between mt-2">
        <div>
          {hasCaption && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-500 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCommit}
            className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Btn({
  title, onClick, active, danger, children,
}: {
  title: string; onClick: () => void; active?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={[
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          : active
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-600" />;
}

function AlignLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="10" y2="8"/><line x1="2" y1="12" x2="12" y2="12"/>
    </svg>
  );
}

function AlignCenterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4"/><line x1="4" y1="8" x2="12" y2="8"/><line x1="3" y1="12" x2="13" y2="12"/>
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="4" y1="12" x2="14" y2="12"/>
    </svg>
  );
}

function CaptionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="9" rx="1.5"/>
      <line x1="4" y1="14" x2="12" y2="14"/>
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 4 4 4 14 4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5m4-5v5"/><rect x="3" y="4" width="10" height="10" rx="1"/>
    </svg>
  );
}
