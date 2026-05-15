'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EditorEngine } from '../../editor/core/EditorEngine';
import { insertImage } from '../../editor/commands';

interface ImageUploadButtonProps {
  engine: EditorEngine;
  onUploadImage?: (file: File) => Promise<string>;
}

type Tab = 'upload' | 'url';

export function ImageUploadButton({ engine, onUploadImage }: ImageUploadButtonProps) {
  const [open, setOpen]             = useState(false);
  const [tab, setTab]               = useState<Tab>('upload');
  const [urlInput, setUrlInput]     = useState('');
  const [urlError, setUrlError]     = useState(false);
  const [altInput, setAltInput]     = useState('');
  const [dragging, setDragging]     = useState(false);
  const [preview, setPreview]       = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const altInputRef  = useRef('');

  // Keep ref in sync so async handleFile always reads latest alt text
  useEffect(() => { altInputRef.current = altInput; }, [altInput]);

  const close = useCallback(() => {
    setOpen(false);
    setUrlInput('');
    setUrlError(false);
    setAltInput('');
    altInputRef.current = '';
    setPreview((prev) => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null; });
    setUploading(false);
    setProgress(0);
    setDragging(false);
  }, []);

  // Outside click → close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  // Escape → close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    // Immediate blob URL preview
    const blobUrl = URL.createObjectURL(file);
    setPreview(blobUrl);
    setAltInput(file.name.replace(/\.[^.]+$/, ''));

    if (!onUploadImage) {
      // No upload service — use blob URL directly
      insertImage(blobUrl, file.name.replace(/\.[^.]+$/, ''))(engine);
      close();
      return;
    }

    // Upload with progress simulation
    setUploading(true);
    setProgress(0);
    const fakeProgress = setInterval(() => {
      setProgress((p) => Math.min(p + 12, 85));
    }, 150);

    try {
      const finalUrl = await onUploadImage(file);
      clearInterval(fakeProgress);
      setProgress(100);
      insertImage(finalUrl, altInputRef.current || file.name.replace(/\.[^.]+$/, ''))(engine);
      setTimeout(close, 300);
    } catch {
      clearInterval(fakeProgress);
      setUploading(false);
      setProgress(0);
    }
  }, [engine, onUploadImage, close]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const commitUrl = () => {
    const url = urlInput.trim();
    if (!url) { setUrlError(true); return; }
    insertImage(url, altInput)(engine);
    close();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title="Insert image"
        aria-expanded={open}
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className={[
          'flex items-center justify-center w-8 h-8 rounded text-sm',
          'text-gray-700 dark:text-gray-300',
          'hover:bg-gray-100 dark:hover:bg-gray-700',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          open ? 'bg-gray-100 dark:bg-gray-700' : '',
        ].join(' ')}
      >
        <ImageIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Insert image"
          className="absolute top-full left-0 mt-1 z-50 w-80
                     bg-white dark:bg-gray-800
                     border border-gray-200 dark:border-gray-600
                     rounded-lg shadow-xl overflow-y-auto
                     max-h-[min(480px,calc(100vh-var(--toolbar-bottom,80px)))]"
        >
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-600">
            {(['upload', 'url'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setTab(t); }}
                className={[
                  'flex-1 py-2 text-xs font-medium capitalize transition-colors',
                  tab === t
                    ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                ].join(' ')}
              >
                {t === 'upload' ? 'Upload file' : 'Insert URL'}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-3">
            {tab === 'upload' ? (
              <>
                {/* Drop zone */}
                {!preview && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={[
                      'flex flex-col items-center justify-center gap-2',
                      'h-32 rounded-lg border-2 border-dashed cursor-pointer',
                      'transition-colors text-center px-4',
                      dragging
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    ].join(' ')}
                  >
                    <UploadIcon />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-blue-600 dark:text-blue-400">Click to upload</span>
                      {' '}or drag & drop
                    </p>
                    <p className="text-[10px] text-gray-400">PNG, JPG, GIF, WebP</p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileInput}
                />

                {/* Preview */}
                {preview && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="preview"
                      className="w-full max-h-40 object-contain rounded-md border border-gray-200 dark:border-gray-600"
                    />
                    {uploading && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-gray-200 rounded-b-md overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-150"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    {!uploading && (
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setPreview((prev) => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null; }); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs hover:bg-black/70"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

                {uploading && (
                  <p className="text-[10px] text-center text-gray-400">
                    Uploading… {progress}%
                  </p>
                )}
              </>
            ) : (
              <>
                {/* URL tab */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
                    Image URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setUrlError(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitUrl(); } }}
                    autoFocus
                    className={[
                      'w-full px-2.5 py-1.5 text-xs rounded border outline-none',
                      'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100',
                      urlError
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    ].join(' ')}
                  />
                  {urlError && <p className="text-[10px] text-red-500 mt-1">Enter a valid URL</p>}
                </div>

                {/* Live preview for URL tab */}
                {urlInput && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urlInput}
                    alt="preview"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                    style={{ display: 'none' }}
                    className="w-full max-h-28 object-contain rounded-md border border-gray-200 dark:border-gray-600"
                  />
                )}
              </>
            )}

            {/* Alt text */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
                Alt text <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Describe the image"
                value={altInput}
                onChange={(e) => setAltInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border outline-none
                           border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Actions */}
            {tab === 'url' && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); close(); }}
                  className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); commitUrl(); }}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Insert
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
