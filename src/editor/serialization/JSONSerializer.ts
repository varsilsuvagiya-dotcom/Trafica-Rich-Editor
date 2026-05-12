/**
 * JSONSerializer
 *
 * Converts the document model to/from a JSON representation.
 * The JSON format IS the model — this serializer is essentially
 * a thin validation + round-trip layer.
 *
 * Use case: persist editor content to a database, load it back.
 */

import type { Document, Serializer } from '../../types';
import { createEmptyDocument } from '../core/DocumentModel';

export const jsonSerializer: Serializer<string> = {
  serialize(doc: Document): string {
    return JSON.stringify(doc, null, 2);
  },

  deserialize(json: string): Document {
    try {
      const parsed = JSON.parse(json);
      if (parsed?.type !== 'doc' || !Array.isArray(parsed?.children)) {
        console.warn('[JSONSerializer] Invalid document JSON, returning empty doc');
        return createEmptyDocument();
      }
      return parsed as Document;
    } catch {
      console.warn('[JSONSerializer] Failed to parse JSON');
      return createEmptyDocument();
    }
  },
};
