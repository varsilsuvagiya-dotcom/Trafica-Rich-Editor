/**
 * TablePlugin
 *
 * EditorPlugin that handles keyboard navigation inside table cells.
 *
 * Tab         → move cursor to next cell (adds row if on last cell)
 * Shift+Tab   → move cursor to previous cell (no-op on first cell)
 *
 * Enter inside a cell is handled by the default handleEnter command because
 * findContentBlockPath correctly resolves to the paragraph inside the cell
 * (table/table_row/table_cell are all in isContainerBlock so they're skipped).
 *
 * Backspace at start of first paragraph in a cell is a safe no-op because
 * joinBlocks checks idx===0 and returns the doc unchanged.
 */

import type { EditorPlugin } from '../../types';
import type { BlockNode } from '../../types';
import { createTransaction, tr_setSelection } from '../core/Transaction';
import { getNodeAtPath } from '../core/DocumentModel';
import { makeCollapsedSelection } from '../selection/SelectionEngine';
import {
  findCellPosition,
  getTableDimensions,
  getCellFirstPosition,
  getCellLastPosition,
  insertTableRowAfter,
} from './TableModel';

export const TablePlugin: EditorPlugin = {
  name: 'table',

  keyBindings: {
    Tab: (engine) => {
      const state = engine.getState();
      const sel = state.selection;
      if (!sel) return false;

      const cellPos = findCellPosition(state.doc, sel.anchor.path);
      if (!cellPos) return false;

      const { tablePath, row, col } = cellPos;
      const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
      const { rows, cols } = getTableDimensions(table);

      // Find next non-covered cell
      let nextRow = row;
      let nextCol = col + 1;
      while (nextRow < rows) {
        if (nextCol >= cols) { nextCol = 0; nextRow++; continue; }
        const c = getNodeAtPath(state.doc, [...tablePath, nextRow, nextCol]) as BlockNode;
        if (!c?.attrs?.covered) break;
        nextCol++;
      }

      if (nextRow >= rows) {
        // Last cell — append a new row and move cursor there
        const newTable = insertTableRowAfter(table, rows - 1);
        const newChildren = [...state.doc.children];
        newChildren[tablePath[0]] = newTable;
        const tempDoc = { type: 'doc' as const, children: newChildren };

        const tr = createTransaction();
        tr.steps.push({ type: 'delete_node', path: tablePath });
        tr.steps.push({
          type: 'insert_node',
          parentPath: tablePath.length > 1 ? tablePath.slice(0, -1) : [],
          index: tablePath[tablePath.length - 1],
          node: newTable,
        });
        const pos = getCellFirstPosition(tempDoc, tablePath, rows, 0);
        if (pos) tr.steps.push(tr_setSelection(makeCollapsedSelection(pos)));
        engine.dispatch(tr);
        return true;
      }

      const pos = getCellFirstPosition(state.doc, tablePath, nextRow, nextCol);
      if (!pos) return false;

      const tr = createTransaction();
      tr.steps.push(tr_setSelection(makeCollapsedSelection(pos)));
      engine.dispatch(tr);
      return true;
    },

    'Shift+Tab': (engine) => {
      const state = engine.getState();
      const sel = state.selection;
      if (!sel) return false;

      const cellPos = findCellPosition(state.doc, sel.anchor.path);
      if (!cellPos) return false;

      const { tablePath, row, col } = cellPos;
      const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
      const { cols } = getTableDimensions(table);

      // Find prev non-covered cell
      let prevRow = row;
      let prevCol = col - 1;
      while (prevRow >= 0) {
        if (prevCol < 0) { prevCol = cols - 1; prevRow--; continue; }
        const c = getNodeAtPath(state.doc, [...tablePath, prevRow, prevCol]) as BlockNode;
        if (!c?.attrs?.covered) break;
        prevCol--;
      }

      if (prevRow < 0) return true; // first cell — swallow Tab, do nothing

      const pos = getCellLastPosition(state.doc, tablePath, prevRow, prevCol);
      if (!pos) return false;

      const tr = createTransaction();
      tr.steps.push(tr_setSelection(makeCollapsedSelection(pos)));
      engine.dispatch(tr);
      return true;
    },
  },
};
