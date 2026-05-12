/**
 * TableCommands
 *
 * All table-related Commands. Each is a pure function (engine) → boolean.
 * Table mutations use delete_node + insert_node to replace the table atomically,
 * which keeps undo/redo working via the existing HistoryManager snapshots.
 */

import type { Command, BlockNode, Document } from '../../types';
import { createTransaction, tr_setSelection } from '../core/Transaction';
import { getNodeAtPath } from '../core/DocumentModel';
import { makeCollapsedSelection, makePosition } from '../selection/SelectionEngine';
import {
  createTableNode,
  getTableDimensions,
  insertTableRowAfter,
  insertTableRowBefore,
  deleteTableRow,
  insertTableColumnAfter,
  insertTableColumnBefore,
  deleteTableColumn,
  mergeTableCells,
  splitTableCell,
  updateColumnWidth,
  findCellPosition,
  getCellFirstPosition,
} from './TableModel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Replace the table at tablePath with newTable in a single transaction.
 * Optionally sets cursor to (cursorRow, cursorCol) in the new table.
 */
function replaceTable(
  engine: Parameters<Command>[0],
  tablePath: number[],
  newTable: BlockNode,
  cursorRow?: number,
  cursorCol?: number,
): boolean {
  const state = engine.getState();
  const tr = createTransaction();

  tr.steps.push({ type: 'delete_node', path: tablePath });
  tr.steps.push({
    type: 'insert_node',
    parentPath: tablePath.length > 1 ? tablePath.slice(0, -1) : [],
    index: tablePath[tablePath.length - 1],
    node: newTable,
  });

  if (cursorRow !== undefined && cursorCol !== undefined) {
    // Build a temporary doc with the new table to resolve the position
    const newChildren = [...state.doc.children];
    newChildren[tablePath[0]] = newTable;
    const tempDoc: Document = { type: 'doc', children: newChildren };
    const pos = getCellFirstPosition(tempDoc, tablePath, cursorRow, cursorCol);
    if (pos) tr.steps.push(tr_setSelection(makeCollapsedSelection(pos)));
  }

  engine.dispatch(tr);
  return true;
}

// ─── Insert Table ─────────────────────────────────────────────────────────────

export function insertTable(rows: number, cols: number): Command {
  return (engine) => {
    const state = engine.getState();
    const sel = state.selection;
    const tableNode = createTableNode(rows, cols);

    // Insert after the current top-level block (or at 0 if no selection)
    const insertIndex = sel ? sel.anchor.path[0] + 1 : state.doc.children.length;

    const tr = createTransaction();
    tr.steps.push({ type: 'insert_node', parentPath: [], index: insertIndex, node: tableNode });

    // Set cursor to first cell of new table
    const newChildren = [...state.doc.children];
    newChildren.splice(insertIndex, 0, tableNode);
    const tempDoc: Document = { type: 'doc', children: newChildren };
    const pos = getCellFirstPosition(tempDoc, [insertIndex], 0, 0);
    if (pos) tr.steps.push(tr_setSelection(makeCollapsedSelection(pos)));

    engine.dispatch(tr);
    return true;
  };
}

// ─── Row Commands ─────────────────────────────────────────────────────────────

export const addRowAbove: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath, row, col } = cellPos;
  const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
  const newTable = insertTableRowBefore(table, row);
  // Cursor stays at same logical row (which is now row+1 after insert)
  return replaceTable(engine, tablePath, newTable, row + 1, col);
};

export const addRowBelow: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath, row, col } = cellPos;
  const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
  const newTable = insertTableRowAfter(table, row);
  return replaceTable(engine, tablePath, newTable, row + 1, col);
};

export const deleteRow: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath, row, col } = cellPos;
  const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
  const newTable = deleteTableRow(table, row);
  const { rows } = getTableDimensions(newTable);
  return replaceTable(engine, tablePath, newTable, Math.min(row, rows - 1), col);
};

// ─── Column Commands ──────────────────────────────────────────────────────────

export const addColumnLeft: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath, row, col } = cellPos;
  const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
  const newTable = insertTableColumnBefore(table, col);
  // Cursor shifts right by 1 (same column position in new grid)
  return replaceTable(engine, tablePath, newTable, row, col + 1);
};

export const addColumnRight: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath, row, col } = cellPos;
  const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
  const newTable = insertTableColumnAfter(table, col);
  return replaceTable(engine, tablePath, newTable, row, col);
};

export const deleteColumn: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath, row, col } = cellPos;
  const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
  const newTable = deleteTableColumn(table, col);
  const { cols } = getTableDimensions(newTable);
  return replaceTable(engine, tablePath, newTable, row, Math.min(col, cols - 1));
};

// ─── Merge / Split ────────────────────────────────────────────────────────────

export function mergeCells(
  tableSelection: { tablePath: number[]; anchorCell: [number, number]; focusCell: [number, number] },
): Command {
  return (engine) => {
    const state = engine.getState();
    const table = getNodeAtPath(state.doc, tableSelection.tablePath) as BlockNode;
    if (!table) return false;

    const newTable = mergeTableCells(table, tableSelection.anchorCell, tableSelection.focusCell);
    const [anchorRow, anchorCol] = [
      Math.min(tableSelection.anchorCell[0], tableSelection.focusCell[0]),
      Math.min(tableSelection.anchorCell[1], tableSelection.focusCell[1]),
    ];
    return replaceTable(engine, tableSelection.tablePath, newTable, anchorRow, anchorCol);
  };
}

export const splitCell: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath, row, col } = cellPos;
  const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
  const newTable = splitTableCell(table, row, col);
  return replaceTable(engine, tablePath, newTable, row, col);
};

// ─── Delete Table ─────────────────────────────────────────────────────────────

export const deleteTable: Command = (engine) => {
  const state = engine.getState();
  const sel = state.selection;
  if (!sel) return false;
  const cellPos = findCellPosition(state.doc, sel.anchor.path);
  if (!cellPos) return false;

  const { tablePath } = cellPos;
  const tableIdx = tablePath[tablePath.length - 1];

  const tr = createTransaction();
  tr.steps.push({ type: 'delete_node', path: tablePath });

  // Land cursor on the nearest surviving block
  const newLen = state.doc.children.length - 1;
  if (newLen > 0) {
    const landIdx = Math.min(tableIdx, newLen - 1);
    tr.steps.push(tr_setSelection(makeCollapsedSelection(makePosition([landIdx], 0))));
  }

  engine.dispatch(tr);
  return true;
};

// ─── Column Resize ────────────────────────────────────────────────────────────

export function setColumnWidth(tablePath: number[], colIndex: number, width: number): Command {
  return (engine) => {
    const state = engine.getState();
    const table = getNodeAtPath(state.doc, tablePath) as BlockNode;
    if (!table) return false;
    const newTable = updateColumnWidth(table, colIndex, width);
    const tr = createTransaction();
    tr.steps.push({ type: 'delete_node', path: tablePath });
    tr.steps.push({
      type: 'insert_node',
      parentPath: tablePath.length > 1 ? tablePath.slice(0, -1) : [],
      index: tablePath[tablePath.length - 1],
      node: newTable,
    });
    engine.dispatch(tr);
    return true;
  };
}
