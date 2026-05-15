'use client';

import React, { useState } from 'react';
import { Editor } from './Editor';
import { useEditorEngine } from '../hooks/useEditorEngine';
import { jsonSerializer } from '../editor/serialization/JSONSerializer';
import { markdownSerializer } from '../editor/serialization/MarkdownSerializer';
import '../editor/editor.css';

type OutputTab = 'html' | 'json' | 'markdown';

export function EditorPage() {
  const engine = useEditorEngine();
  const [html, setHtml] = useState('');
  const [json, setJson] = useState('');
  const [activeTab, setActiveTab] = useState<OutputTab>('html');

  const markdown = markdownSerializer.serialize(engine.getState().doc);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            RichEditor
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-mono">
            engine v1
          </span>
        </div>
        <span className="text-sm text-gray-400 dark:text-gray-500 ml-auto hidden sm:block">
          Custom editor engine · No external editor frameworks
        </span>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Editor panel */}
        <div className="flex-1 flex flex-col p-4 lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
            Editor
          </p>
          <Editor
            engine={engine}
            placeholder="Start writing… (Ctrl+B bold, Ctrl+I italic, Ctrl+Z undo)"
            onHTMLChange={setHtml}
            onJSONChange={setJson}
          />
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-800" />
        <div className="block lg:hidden h-px bg-gray-200 dark:bg-gray-800 mx-4" />

        {/* Output panel */}
        <div className="w-full lg:w-[420px] flex flex-col p-4 lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
            Serialized Output
          </p>

          {/* Tabs */}
          <div className="flex gap-1 mb-3">
            {(['html', 'json', 'markdown'] as OutputTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'px-3 py-1 rounded text-xs font-semibold uppercase tracking-wide transition-colors',
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                ].join(' ')}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Output box */}
          <pre className="flex-1 overflow-auto text-xs font-mono bg-gray-900 dark:bg-gray-950 text-green-400 rounded-lg p-4 whitespace-pre-wrap break-all min-h-[200px] lg:min-h-0">
            {activeTab === 'html' && (html || '<!-- empty -->')}
            {activeTab === 'json' && (json || '{}')}
            {activeTab === 'markdown' && (markdown || '<!-- empty -->')}
          </pre>
        </div>
      </div>

      {/* Footer with keyboard shortcuts reference */}
      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
          {[
            ['Ctrl+B', 'Bold'],
            ['Ctrl+I', 'Italic'],
            ['Ctrl+U', 'Underline'],
            ['Ctrl+Z', 'Undo'],
            ['Ctrl+Y', 'Redo'],
            ['Enter', 'New block'],
            ['Backspace', 'Delete / Join'],
          ].map(([key, desc]) => (
            <span key={key}>
              <kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{key}</kbd>
              {' '}{desc}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
