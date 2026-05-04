/**
 * @gerts/core - Entity Reference Protocol
 *
 * Standard format for entity mentions across chat and discovery:
 * `[[Type:uuid|Label]]`
 *
 * Used by chat completions to annotate entity names in LLM responses,
 * and by the frontend to render clickable links to Discovery Console.
 */

/** Parsed entity reference. */
export interface EntityRef {
  type: string;
  id: string;
  label: string;
}

/** Parsed entity reference with position in source text. */
export interface EntityRefMatch extends EntityRef {
  start: number;
  end: number;
}

/** Regex for matching [[Type:uuid|Label]] in text. Use with .exec() loop or matchAll(). */
export const ENTITY_REF_REGEX = /\[\[([^:\]]+):([^\]|]+)\|([^\]]+)\]\]/g;

/**
 * Parse all entity references from text.
 * Returns array of matches with their positions.
 */
export function parseEntityRefs(text: string): EntityRefMatch[] {
  const results: EntityRefMatch[] = [];
  const regex = new RegExp(ENTITY_REF_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      type: match[1],
      id: match[2],
      label: match[3],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return results;
}

/** Serialize an entity reference back to [[Type:id|Label]] format. */
export function serializeEntityRef(ref: EntityRef): string {
  return `[[${ref.type}:${ref.id}|${ref.label}]]`;
}

/**
 * Replace entity names in text with entity references.
 * Case-insensitive, whole-word matching. Longer names matched first.
 */
export function injectEntityRefs(
  text: string,
  entities: Array<{ id: string; name: string; type: string }>,
): string {
  if (entities.length === 0) return text;

  // Sort by name length descending — longer names first to avoid partial matches
  const sorted = [...entities].sort((a, b) => b.name.length - a.name.length);

  // Use placeholder approach: replace refs with markers, inject, then restore
  // This prevents matching entity names inside already-injected refs
  const placeholders: string[] = [];
  let result = text;

  for (const entity of sorted) {
    const escaped = entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const ref = serializeEntityRef({
      type: entity.type,
      id: entity.id,
      label: entity.name,
    });
    result = result.replace(regex, () => {
      const idx = placeholders.length;
      placeholders.push(ref);
      return `\x00REF${idx}\x00`;
    });
  }

  // Restore placeholders
  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`\x00REF${i}\x00`, placeholders[i]);
  }
  return result;
}
