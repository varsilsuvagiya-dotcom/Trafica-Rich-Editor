import { createEditorEngine } from '../src/editor/core/EditorEngine.ts';
import { insertText, toggleBulletList, toggleOrderedList } from '../src/editor/commands/index.ts';
import { htmlSerializer } from '../src/editor/serialization/HTMLSerializer.ts';
import { createTransaction, tr_setSelection } from '../src/editor/core/Transaction.ts';

function place(e: any, path: number[], offset: number) {
  const tr = createTransaction();
  tr.steps.push(tr_setSelection({ anchor: { path, offset }, focus: { path, offset }, isCollapsed: true }));
  e.dispatch(tr);
}

const e = createEditorEngine();
place(e, [0], 0);
insertText('hello')(e);
console.log('Before UL:', htmlSerializer.serialize(e.getState().doc));
toggleBulletList(e);
console.log('After UL:', htmlSerializer.serialize(e.getState().doc));
toggleBulletList(e);
console.log('After unUL:', htmlSerializer.serialize(e.getState().doc));

const e2 = createEditorEngine();
place(e2, [0], 0);
insertText('world')(e2);
toggleOrderedList(e2);
console.log('After OL:', htmlSerializer.serialize(e2.getState().doc));
