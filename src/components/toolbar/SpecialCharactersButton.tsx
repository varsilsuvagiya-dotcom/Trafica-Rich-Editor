"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { EditorEngine } from "../../editor/core/EditorEngine";
import { insertText } from "../../editor/commands";
import {
  SPECIAL_CHARACTERS,
  CATEGORIES,
  type Category,
} from "../../data/specialCharacters";

interface SpecialCharactersButtonProps {
  engine: EditorEngine;
}

export function SpecialCharactersButton({
  engine,
}: SpecialCharactersButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("All");
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<{ char: string; name: string } | null>(
    null,
  );
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return SPECIAL_CHARACTERS.filter(
      (c) =>
        (category === "All" || c.category === category) &&
        (!q || c.name.toLowerCase().includes(q) || c.char.includes(q)),
    );
  }, [category, search]);

  const openModal = () => {
    setOpen(true);
    setSearch("");
    setFocusedIdx(-1);
  };

  const closeModal = useCallback(() => {
    setOpen(false);
    setHovered(null);
    setFocusedIdx(-1);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeModal();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeModal]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const insertChar = useCallback(
    (char: string) => {
      insertText(char)(engine);
      closeModal();
    },
    [engine, closeModal],
  );

  // Keyboard nav in grid
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    const cols = 8;
    const len = filtered.length;
    if (len === 0) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, len - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + cols, len - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - cols, 0));
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      e.preventDefault();
      insertChar(filtered[focusedIdx].char);
    } else if (e.key === "Escape") {
      closeModal();
    }
  };

  // Sync focused cell into view
  useEffect(() => {
    if (focusedIdx < 0 || !gridRef.current) return;
    const cell = gridRef.current.children[focusedIdx] as
      | HTMLElement
      | undefined;
    cell?.focus();
  }, [focusedIdx]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title="Special Characters"
        aria-label="Insert special character"
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault();
          open ? closeModal() : openModal();
        }}
        className={[
          "flex items-center justify-center w-8 h-8 rounded text-sm font-medium transition-colors",
          open
            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700",
        ].join(" ")}
      >
        <OmegaIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Special characters"
          aria-modal="true"
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-2xl flex flex-col"
          style={{ width: 340, maxHeight: 420 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeModal();
          }}
        >
          {/* Header */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Special Characters
              </span>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Search */}
            <input
              ref={searchRef}
              type="search"
              placeholder="Search characters…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFocusedIdx(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeModal();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setFocusedIdx(0);
                  gridRef.current?.children[0]?.dispatchEvent(
                    new Event("focus"),
                  );
                }
              }}
              className="w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Category tabs */}
            <div className="flex flex-wrap gap-1 mt-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCategory(cat);
                    setFocusedIdx(-1);
                  }}
                  className={[
                    "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                    category === cat
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600",
                  ].join(" ")}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Character grid */}
          <div
            ref={gridRef}
            role="grid"
            aria-label="Character grid"
            className="flex-1 overflow-y-auto p-2"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 2,
            }}
            onKeyDown={handleGridKeyDown}
          >
            {filtered.length === 0 ? (
              <div
                className="col-span-8 text-center py-8 text-sm text-gray-400 dark:text-gray-500"
                role="status"
              >
                No characters found
              </div>
            ) : (
              filtered.map((c, idx) => (
                <button
                  key={c.char + c.name}
                  type="button"
                  role="gridcell"
                  tabIndex={focusedIdx === idx ? 0 : -1}
                  aria-label={c.name}
                  title={c.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertChar(c.char);
                  }}
                  onMouseEnter={() =>
                    setHovered({ char: c.char, name: c.name })
                  }
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered({ char: c.char, name: c.name })}
                  onBlur={() => setHovered(null)}
                  className={[
                    "flex items-center justify-center rounded text-base h-8 w-full transition-colors cursor-pointer select-none",
                    focusedIdx === idx
                      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500"
                      : "text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300",
                  ].join(" ")}
                >
                  {c.char}
                </button>
              ))
            )}
          </div>

          {/* Footer preview */}
          <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3 min-h-[40px]">
            {hovered ? (
              <>
                <span className="text-2xl leading-none text-gray-800 dark:text-gray-100 w-8 text-center">
                  {hovered.char}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {hovered.name}
                </span>
              </>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Hover or use arrow keys to preview
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OmegaIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M16.164 4.561c-6.459 0-11.721 5.618-11.721 12.576 0 2.663 0.766 5.168 2.076 7.204-1.525-0.826-3.023-1.826-4.518-3.052v5.935h10.907c-2.995-2.075-5.087-5.131-5.087-8.621 0-4.653 3.736-8.425 8.343-8.425s8.343 3.772 8.343 8.425c0 3.49-2.092 6.546-5.087 8.621h10.907v-5.935c-1.499 1.24-3.014 2.259-4.558 3.093 1.329-2.045 2.116-4.561 2.116-7.244 0-6.958-5.262-12.576-11.721-12.576h-0z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
