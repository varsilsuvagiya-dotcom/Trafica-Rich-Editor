// ─── Mark Types ───────────────────────────────────────────────────────────────
// A Mark is inline formatting applied to a span of text (bold, italic, etc.)
// Marks are value objects: two marks of the same type+attrs are identical.

export type MarkType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'highlight'
  | 'font_size'
  | 'font_family'
  | 'text_color';

export interface Mark {
  type: MarkType;
  attrs?: Record<string, string | number | boolean>;
}

// ─── Node Types ───────────────────────────────────────────────────────────────
// Block-level node types that form the document tree.

export type BlockNodeType =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bullet_list'
  | 'ordered_list'
  | 'list_item'
  | 'check_list'
  | 'check_list_item'
  | 'code_block'
  | 'image'
  | 'horizontal_rule'
  | 'hard_break'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'table_header';

export type InlineNodeType = 'text' | 'inline_image';

export type NodeType = BlockNodeType | InlineNodeType;

// ─── Document Nodes ───────────────────────────────────────────────────────────
// The document is a tree of EditorNodes.
// Text nodes are leaves; block nodes contain children.

export interface TextNode {
  type: 'text';
  text: string;
  marks: Mark[];
}

export interface BlockNode {
  type: BlockNodeType;
  attrs: NodeAttrs;
  children: EditorNode[];
}

export type EditorNode = TextNode | BlockNode;

export type AlignmentType = 'left' | 'center' | 'right' | 'justify';

export interface NodeAttrs {
  level?: 1 | 2 | 3 | 4 | 5 | 6; // for headings
  src?: string;                     // for images
  alt?: string;
  caption?: string;                 // for images
  width?: number;                   // for images (px)
  start?: number;                   // for ordered lists
  language?: string;                // for code blocks
  align?: AlignmentType;            // text alignment
  [key: string]: unknown;
}

// ─── Document ─────────────────────────────────────────────────────────────────
// The root of the document tree. Always type='doc'.

export interface Document {
  type: 'doc';
  children: BlockNode[];
}

// ─── Selection ────────────────────────────────────────────────────────────────
// Selection is stored as integer offsets into the flat text of the document,
// NOT as DOM ranges. This makes it browser-independent and serializable.
//
// anchor = where the selection started (stays fixed)
// focus  = where the cursor is now (moves as user drags)
// When anchor === focus the selection is a collapsed cursor.

export interface EditorSelection {
  anchor: NodePosition;
  focus: NodePosition;
  isCollapsed: boolean;
}

// A NodePosition pinpoints a location inside the document tree:
// - path: array of child indices from doc root → target node
// - offset: character offset within a text node (or child index in a block)
export interface NodePosition {
  path: number[];
  offset: number;
}

// ─── Editor State ─────────────────────────────────────────────────────────────
// The entire editor state is one plain object. It is IMMUTABLE — never mutate
// it. Every change produces a new EditorState via applyTransaction().

export interface EditorState {
  doc: Document;
  selection: EditorSelection | null;
  marks: Mark[]; // pending marks to apply to next inserted text
  version: number; // monotonically increasing, used for history
}

// ─── Transactions ─────────────────────────────────────────────────────────────
// A Transaction describes a set of changes to apply atomically.
// Steps are applied in order to produce a new EditorState.

export type StepType =
  | 'insert_text'
  | 'delete_text'
  | 'delete_range'
  | 'insert_node'
  | 'delete_node'
  | 'split_block'
  | 'join_blocks'
  | 'set_node_type'
  | 'set_node_attrs'
  | 'add_mark'
  | 'remove_mark'
  | 'set_mark'
  | 'set_selection'
  | 'replace_doc';

export interface BaseStep {
  type: StepType;
}

export interface InsertTextStep extends BaseStep {
  type: 'insert_text';
  path: number[];   // path to a TextNode
  offset: number;
  text: string;
  marks: Mark[];
}

export interface DeleteTextStep extends BaseStep {
  type: 'delete_text';
  path: number[];
  from: number;
  to: number;
}

export interface DeleteRangeStep extends BaseStep {
  type: 'delete_range';
  from: NodePosition;
  to: NodePosition;
}

export interface InsertNodeStep extends BaseStep {
  type: 'insert_node';
  parentPath: number[];
  index: number;
  node: EditorNode;
}

export interface DeleteNodeStep extends BaseStep {
  type: 'delete_node';
  path: number[];
}

export interface SplitBlockStep extends BaseStep {
  type: 'split_block';
  path: number[];   // path to the block being split
  offset: number;   // text offset where split occurs
}

export interface JoinBlocksStep extends BaseStep {
  type: 'join_blocks';
  path: number[];   // path to the SECOND block (will be merged into prior)
}

export interface SetNodeTypeStep extends BaseStep {
  type: 'set_node_type';
  path: number[];
  nodeType: BlockNodeType;
  attrs?: NodeAttrs;
}

export interface SetNodeAttrsStep extends BaseStep {
  type: 'set_node_attrs';
  path: number[];
  attrs: NodeAttrs;
}

export interface AddMarkStep extends BaseStep {
  type: 'add_mark';
  from: NodePosition;
  to: NodePosition;
  mark: Mark;
}

export interface RemoveMarkStep extends BaseStep {
  type: 'remove_mark';
  from: NodePosition;
  to: NodePosition;
  markType: MarkType;
}

export interface SetMarkStep extends BaseStep {
  type: 'set_mark';
  from: NodePosition;
  to: NodePosition;
  markType: MarkType;
  mark: Mark | null; // null = remove the mark type entirely
}

export interface SetSelectionStep extends BaseStep {
  type: 'set_selection';
  selection: EditorSelection | null;
}

export interface ReplaceDocStep extends BaseStep {
  type: 'replace_doc';
  doc: Document;
}

export type Step =
  | InsertTextStep
  | DeleteTextStep
  | DeleteRangeStep
  | InsertNodeStep
  | DeleteNodeStep
  | SplitBlockStep
  | JoinBlocksStep
  | SetNodeTypeStep
  | SetNodeAttrsStep
  | AddMarkStep
  | RemoveMarkStep
  | SetMarkStep
  | SetSelectionStep
  | ReplaceDocStep;

export interface Transaction {
  id: string;
  steps: Step[];
  meta: Record<string, unknown>; // arbitrary metadata (e.g., { historyGroup: true })
  timestamp: number;
}

// ─── Plugin System ────────────────────────────────────────────────────────────

export interface EditorPlugin {
  name: string;
  // Called once when the plugin is registered
  init?: (engine: EditorEngineInterface) => void;
  // Intercept a transaction before it is applied; return modified or original
  onTransaction?: (tr: Transaction, state: EditorState) => Transaction;
  // Called after state changes
  onStateChange?: (state: EditorState, prevState: EditorState) => void;
  // Provide additional key bindings; return true to stop propagation
  keyBindings?: Record<string, (engine: EditorEngineInterface) => boolean>;
}

// Forward declaration for plugin interface
export interface EditorEngineInterface {
  getState(): EditorState;
  dispatch(tr: Transaction): void;
  registerPlugin(plugin: EditorPlugin): void;
  subscribe(listener: StateListener): () => void;
  getPlugin?<T extends EditorPlugin>(name: string): T | undefined;
}

export type StateListener = (state: EditorState, prevState: EditorState) => void;

// ─── Command ──────────────────────────────────────────────────────────────────
// A Command is a function that takes the engine and produces side effects
// (dispatching a transaction). Returns true if it handled the action.

export type Command = (engine: EditorEngineInterface) => boolean;

// ─── Serialization ────────────────────────────────────────────────────────────

export interface Serializer<T> {
  serialize(doc: Document): T;
  deserialize(input: T): Document;
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

export interface ToolbarItem {
  type: 'button' | 'separator' | 'dropdown';
  id: string;
  label?: string;
  icon?: string;
  command?: Command;
  isActive?: (state: EditorState) => boolean;
  isDisabled?: (state: EditorState) => boolean;
  children?: ToolbarItem[]; // for dropdowns
}
