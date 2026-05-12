// End-to-end smoke test of the editor model layer (no DOM, no React).
// Run with: npx tsx scripts/smoke-test.mjs

import { createEditorEngine } from '../src/editor/core/EditorEngine.ts';
import {
  defaultKeyboardPlugin,
  insertText, handleEnter, handleBackspace,
  toggleBold, toggleItalic, toggleStrikethrough,
} from '../src/editor/commands/index.ts';
import { htmlSerializer } from '../src/editor/serialization/HTMLSerializer.ts';
import { jsonSerializer } from '../src/editor/serialization/JSONSerializer.ts';
import { tr_setSelection, createTransaction } from '../src/editor/core/Transaction.ts';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('PASS:', msg);
}

function placeCursor(engine, path, offset) {
  const tr = createTransaction();
  tr.steps.push(tr_setSelection({
    anchor: { path, offset },
    focus: { path, offset },
    isCollapsed: true,
  }));
  engine.dispatch(tr);
}

function selectRange(engine, fromPath, fromOff, toPath, toOff) {
  const tr = createTransaction();
  tr.steps.push(tr_setSelection({
    anchor: { path: fromPath, offset: fromOff },
    focus: { path: toPath, offset: toOff },
    isCollapsed: false,
  }));
  engine.dispatch(tr);
}

// ─── Test 1: Type into empty editor ──────────────────────────────────────────
{
  const e = createEditorEngine();
  e.registerPlugin(defaultKeyboardPlugin);
  placeCursor(e, [0], 0);
  insertText('h')(e);
  insertText('i')(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p>hi</p>', `Type "hi" → ${html}`);
}

// ─── Test 2: Bold on selected text marks only the selection ──────────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('hello world')(e);
  // Select "hello"
  selectRange(e, [0, 0], 0, [0, 0], 5);
  toggleBold(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p><strong>hello</strong> world</p>', `Bold "hello" → ${html}`);
}

// ─── Test 3: Bold middle of word splits text node correctly ──────────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('abcdef')(e);
  selectRange(e, [0, 0], 2, [0, 0], 4);
  toggleBold(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p>ab<strong>cd</strong>ef</p>', `Bold "cd" in "abcdef" → ${html}`);
}

// ─── Test 4: Italic + Strikethrough on the same selection ────────────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('one two')(e);
  selectRange(e, [0, 0], 0, [0, 0], 3);
  toggleItalic(e);
  // After bold/italic, the doc is split into multiple text nodes. Find the run
  // we just italicized — it should be at [0, 0] still since "one" was at the start.
  selectRange(e, [0, 0], 0, [0, 0], 3);
  toggleStrikethrough(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(
    html === '<p><s><em>one</em></s> two</p>' || html === '<p><em><s>one</s></em> two</p>',
    `Italic + strike "one" → ${html}`,
  );
}

// ─── Test 5: Typing with range selected replaces it ──────────────────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('hello world')(e);
  selectRange(e, [0, 0], 0, [0, 0], 5);
  insertText('HI')(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p>HI world</p>', `Replace "hello" with "HI" → ${html}`);
}

// ─── Test 6: Backspace on range deletes the range ────────────────────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('abcdef')(e);
  selectRange(e, [0, 0], 1, [0, 0], 4);
  handleBackspace(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p>aef</p>', `Backspace range "bcd" in "abcdef" → ${html}`);
}

// ─── Test 7: Enter in bold text preserves marks on both halves ───────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('boldtext')(e);
  selectRange(e, [0, 0], 0, [0, 0], 8);
  toggleBold(e);
  // Cursor between "bold" and "text"
  placeCursor(e, [0, 0], 4);
  handleEnter(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p><strong>bold</strong></p><p><strong>text</strong></p>', `Enter in bold → ${html}`);
}

// ─── Test 8: Pending marks: bold-then-type produces bold text ────────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  toggleBold(e); // collapsed cursor → pending mark
  insertText('x')(e);
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p><strong>x</strong></p>', `Pending bold then type "x" → ${html}`);
}

// ─── Test 9: Removing mark on partial selection unsets just that range ───────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('hello')(e);
  selectRange(e, [0, 0], 0, [0, 0], 5);
  toggleBold(e); // <p><strong>hello</strong></p>
  selectRange(e, [0, 0], 1, [0, 0], 3);
  toggleBold(e); // unbold "el" in middle
  const html = htmlSerializer.serialize(e.getState().doc);
  assert(html === '<p><strong>h</strong>el<strong>lo</strong></p>', `Unbold "el" in middle → ${html}`);
}

// ─── Test 10: JSON roundtrip ────────────────────────────────────────────────
{
  const e = createEditorEngine();
  placeCursor(e, [0], 0);
  insertText('round')(e);
  selectRange(e, [0, 0], 0, [0, 0], 5);
  toggleBold(e);
  const json = jsonSerializer.serialize(e.getState().doc);
  const parsed = JSON.parse(json);
  assert(parsed.type === 'doc' && parsed.children[0].children[0].marks[0].type === 'bold',
    `JSON round-trip: ${json.slice(0, 80)}...`);
}

console.log('\nAll smoke tests passed.');
