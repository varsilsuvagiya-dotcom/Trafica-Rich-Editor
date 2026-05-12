/**
 * TableModel
 *
 * Pure, immutable operations on table nodes. No DOM, no React, no side effects.
 * Mirrors the pattern of DocumentModel.ts for the table sub-tree.
 *
 * Table structure in the document:
 *   table { attrs: { colWidths: number[] }, children: [table_row, ...] }
 *     table_row { children: [table_cell | table_header, ...] }
 *       table_cell { attrs: { colspan, rowspan, covered }, children: [paragraph, ...] }
 *
 * Covered cells: when a cell spans multiple cols/rows, the "shadowed" grid
 * positions still have a table_cell node with attrs.covered=true and empty
 * children. The renderer skips them; the model keeps the grid rectangular.
 */

import type { BlockNode, Document, EditorNode, NodePosition } from '../../types';
import { getNodeAtPath, isTextNode, createParagraph } from '../core/DocumentModel';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TableDimensions {
  rows: number;
  cols: number;
}

export interface CellPosition {
  tablePath: number[];
  row: number;
  col: number;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTableNode(rows: number, cols: number, defaultColWidth = 120): BlockNode {
  const colWidths = Array.from({ length: cols }, () => defaultColWidth);
  return {
    type: 'table',
    attrs: { colWidths },
    children: Array.from({ length: rows }, () => createTableRow(cols)),
  };
}

function createTableRow(cols: number): BlockNode {
  return {
    type: 'table_row',
    attrs: {},
    children: Array.from({ length: cols }, () => createTableCell()),
  };
}

export function createTableCell(content = ''): BlockNode {
  return {
    type: 'table_cell',
    attrs: { colspan: 1, rowspan: 1, covered: false },
    children: [createParagraph(content)],
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getTableDimensions(table: BlockNode): TableDimensions {
  const rows = table.children.length;
  const cols = rows > 0 ? (table.children[0] as BlockNode).children.length : 0;
  return { rows, cols };
}

export function getTableCell(table: BlockNode, row: number, col: number): BlockNode | null {
  const rowNode = table.children[row] as BlockNode | undefined;
  if (!rowNode) return null;
  return (rowNode.children[col] as BlockNode) ?? null;
}

/**
 * Walk from a node path upward to find the ancestor table path.
 * Returns null if not inside a table.
 */
export function findTablePath(doc: Document, path: number[]): number[] | null {
  for (let depth = path.length - 1; depth >= 1; depth--) {
    const candidate = path.slice(0, depth);
    const node = getNodeAtPath(doc, candidate);
    if (node && !isTextNode(node as EditorNode) && (node as BlockNode).type === 'table') {
      return candidate;
    }
  }
  return null;
}

/**
 * Derive { tablePath, row, col } from a selection path inside a table.
 * path=[2,0,1,...] → tablePath=[2], row=0, col=1
 */
export function findCellPosition(doc: Document, path: number[]): CellPosition | null {
  const tablePath = findTablePath(doc, path);
  if (!tablePath) return null;

  const rowIdx = path[tablePath.length];
  const colIdx = path[tablePath.length + 1];
  if (rowIdx === undefined || colIdx === undefined) return null;

  return { tablePath, row: rowIdx, col: colIdx };
}

/**
 * Get the NodePosition for the first editable position in a cell.
 * Navigates: cell → first paragraph → first text node (or block).
 */
export function getCellFirstPosition(
  doc: Document,
  tablePath: number[],
  row: number,
  col: number,
): NodePosition | null {
  const cellPath = [...tablePath, row, col];
  const cell = getNodeAtPath(doc, cellPath);
  if (!cell || isTextNode(cell as EditorNode)) return null;

  const cellBlock = cell as BlockNode;
  if (cellBlock.attrs.covered) return null;

  if (cellBlock.children.length === 0) return { path: cellPath, offset: 0 };

  const firstChildPath = [...cellPath, 0];
  const firstChild = cellBlock.children[0];

  if (isTextNode(firstChild)) return { path: firstChildPath, offset: 0 };

  // First child is a block (paragraph) — go one level deeper
  const firstParagraph = firstChild as BlockNode;
  if (firstParagraph.children.length > 0) {
    return { path: [...firstChildPath, 0], offset: 0 };
  }
  return { path: firstChildPath, offset: 0 };
}

/**
 * Get the NodePosition for the last editable position in a cell (for Shift+Tab).
 */
export function getCellLastPosition(
  doc: Document,
  tablePath: number[],
  row: number,
  col: number,
): NodePosition | null {
  const cellPath = [...tablePath, row, col];
  const cell = getNodeAtPath(doc, cellPath);
  if (!cell || isTextNode(cell as EditorNode)) return null;

  const cellBlock = cell as BlockNode;
  if (cellBlock.attrs.covered) return null;

  if (cellBlock.children.length === 0) return { path: cellPath, offset: 0 };

  const lastParaIdx = cellBlock.children.length - 1;
  const lastParaPath = [...cellPath, lastParaIdx];
  const lastPara = cellBlock.children[lastParaIdx] as BlockNode;

  if (lastPara.children.length > 0) {
    const lastTextIdx = lastPara.children.length - 1;
    const lastText = lastPara.children[lastTextIdx];
    if (isTextNode(lastText)) {
      return { path: [...lastParaPath, lastTextIdx], offset: lastText.text.length };
    }
  }
  return { path: lastParaPath, offset: 0 };
}

// ─── Row Operations ───────────────────────────────────────────────────────────

/** Insert a new empty row after rowIndex. */
export function insertTableRowAfter(table: BlockNode, rowIndex: number): BlockNode {
  const { cols } = getTableDimensions(table);
  const newRow = createTableRow(cols);
  const rows = [...(table.children as BlockNode[])];
  rows.splice(rowIndex + 1, 0, newRow);
  return { ...table, children: rows };
}

/** Insert a new empty row before rowIndex. */
export function insertTableRowBefore(table: BlockNode, rowIndex: number): BlockNode {
  if (rowIndex <= 0) return insertTableRowAfter(table, -1);
  return insertTableRowAfter(table, rowIndex - 1);
}

/** Delete row at rowIndex. No-op if it's the only row. */
export function deleteTableRow(table: BlockNode, rowIndex: number): BlockNode {
  const rows = table.children as BlockNode[];
  if (rows.length <= 1) return table;
  return { ...table, children: rows.filter((_, i) => i !== rowIndex) };
}

// ─── Column Operations ────────────────────────────────────────────────────────

/** Insert a new empty column after colIndex. */
export function insertTableColumnAfter(table: BlockNode, colIndex: number): BlockNode {
  const newRows = (table.children as BlockNode[]).map((row) => {
    const cells = [...(row.children as BlockNode[])];
    cells.splice(colIndex + 1, 0, createTableCell());
    return { ...row, children: cells };
  });

  const colWidths = [...((table.attrs.colWidths as number[]) ?? [])];
  const insertWidth = colWidths[colIndex] ?? 120;
  colWidths.splice(colIndex + 1, 0, insertWidth);

  return { ...table, attrs: { ...table.attrs, colWidths }, children: newRows };
}

/** Insert a new empty column before colIndex. */
export function insertTableColumnBefore(table: BlockNode, colIndex: number): BlockNode {
  if (colIndex <= 0) return insertTableColumnAfter(table, -1);
  return insertTableColumnAfter(table, colIndex - 1);
}

/** Delete column at colIndex. No-op if it's the only column. */
export function deleteTableColumn(table: BlockNode, colIndex: number): BlockNode {
  const { cols } = getTableDimensions(table);
  if (cols <= 1) return table;

  const newRows = (table.children as BlockNode[]).map((row) => ({
    ...row,
    children: (row.children as BlockNode[]).filter((_, i) => i !== colIndex),
  }));

  const colWidths = [...((table.attrs.colWidths as number[]) ?? [])];
  colWidths.splice(colIndex, 1);

  return { ...table, attrs: { ...table.attrs, colWidths }, children: newRows };
}

// ─── Merge / Split ────────────────────────────────────────────────────────────

/**
 * Merge the rectangular cell range from (r1,c1) to (r2,c2) into one cell.
 * The top-left anchor cell absorbs all content; others become covered.
 */
export function mergeTableCells(
  table: BlockNode,
  from: [number, number],
  to: [number, number],
): BlockNode {
  const minRow = Math.min(from[0], to[0]);
  const maxRow = Math.max(from[0], to[0]);
  const minCol = Math.min(from[1], to[1]);
  const maxCol = Math.max(from[1], to[1]);

  const colspan = maxCol - minCol + 1;
  const rowspan = maxRow - minRow + 1;

  // Collect all non-covered cell content
  const allChildren: BlockNode[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = getTableCell(table, r, c);
      if (cell && !cell.attrs.covered) {
        allChildren.push(...(cell.children as BlockNode[]));
      }
    }
  }

  const mergedContent =
    allChildren.filter((b) => {
      if (b.type !== 'paragraph') return true;
      // Filter out empty paragraphs from non-anchor cells
      return b.children.length > 0;
    });

  const anchorContent = mergedContent.length > 0 ? mergedContent : [createParagraph()];

  const newRows = (table.children as BlockNode[]).map((rowNode, r) => {
    if (r < minRow || r > maxRow) return rowNode;
    const newCells = (rowNode.children as BlockNode[]).map((cellNode, c) => {
      if (c < minCol || c > maxCol) return cellNode;
      if (r === minRow && c === minCol) {
        return {
          ...cellNode,
          attrs: { ...cellNode.attrs, colspan, rowspan, covered: false },
          children: anchorContent,
        };
      }
      return {
        ...cellNode,
        attrs: { ...cellNode.attrs, colspan: 1, rowspan: 1, covered: true },
        children: [createParagraph()],
      };
    });
    return { ...rowNode, children: newCells };
  });

  return { ...table, children: newRows };
}

/**
 * Split a merged cell back to individual cells, restoring the covered cells.
 */
export function splitTableCell(table: BlockNode, row: number, col: number): BlockNode {
  const cell = getTableCell(table, row, col);
  if (!cell) return table;

  const colspan = (cell.attrs.colspan as number) ?? 1;
  const rowspan = (cell.attrs.rowspan as number) ?? 1;
  if (colspan <= 1 && rowspan <= 1) return table;

  const newRows = (table.children as BlockNode[]).map((rowNode, r) => {
    if (r < row || r >= row + rowspan) return rowNode;
    const newCells = (rowNode.children as BlockNode[]).map((cellNode, c) => {
      if (c < col || c >= col + colspan) return cellNode;
      if (r === row && c === col) {
        return { ...cellNode, attrs: { ...cellNode.attrs, colspan: 1, rowspan: 1, covered: false } };
      }
      return {
        ...cellNode,
        attrs: { ...cellNode.attrs, colspan: 1, rowspan: 1, covered: false },
        children: [createParagraph()],
      };
    });
    return { ...rowNode, children: newCells };
  });

  return { ...table, children: newRows };
}

// ─── Column Resize ────────────────────────────────────────────────────────────

export function updateColumnWidth(table: BlockNode, colIndex: number, width: number): BlockNode {
  const colWidths = [...((table.attrs.colWidths as number[]) ?? [])];
  colWidths[colIndex] = Math.max(40, width);
  return { ...table, attrs: { ...table.attrs, colWidths } };
}
