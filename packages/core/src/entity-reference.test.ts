/**
 * Entity Reference Protocol Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseEntityRefs,
  serializeEntityRef,
  injectEntityRefs,
  ENTITY_REF_REGEX,
} from './entity-reference.js';

describe('parseEntityRefs', () => {
  it('should parse single ref from text', () => {
    const text = 'Check out [[Organization:abc-123|Сбербанк]] for details.';
    const refs = parseEntityRefs(text);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      type: 'Organization',
      id: 'abc-123',
      label: 'Сбербанк',
      start: 10,
      end: 43,
    });
  });

  it('should parse multiple refs from text', () => {
    const text = '[[Person:a1|Alice]] works at [[Organization:b2|Acme Corp]]';
    const refs = parseEntityRefs(text);
    expect(refs).toHaveLength(2);
    expect(refs[0].label).toBe('Alice');
    expect(refs[1].label).toBe('Acme Corp');
  });

  it('should return correct start/end positions', () => {
    const text = 'Hello [[Concept:x|ML]] world';
    const refs = parseEntityRefs(text);
    expect(refs[0].start).toBe(6);
    expect(refs[0].end).toBe(22);
    expect(text.slice(refs[0].start, refs[0].end)).toBe('[[Concept:x|ML]]');
  });

  it('should return empty array for no refs', () => {
    expect(parseEntityRefs('No entities here')).toEqual([]);
    expect(parseEntityRefs('')).toEqual([]);
  });
});

describe('serializeEntityRef', () => {
  it('should create correct format', () => {
    expect(serializeEntityRef({ type: 'Person', id: 'abc', label: 'Alice' })).toBe(
      '[[Person:abc|Alice]]',
    );
  });

  it('should handle unicode labels', () => {
    expect(serializeEntityRef({ type: 'Organization', id: '123', label: 'Газпром' })).toBe(
      '[[Organization:123|Газпром]]',
    );
  });
});

describe('round-trip', () => {
  it('should parse(serialize(ref)) === ref', () => {
    const ref = { type: 'Event', id: 'uuid-456', label: 'Conference 2026' };
    const serialized = serializeEntityRef(ref);
    const parsed = parseEntityRefs(serialized);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe(ref.type);
    expect(parsed[0].id).toBe(ref.id);
    expect(parsed[0].label).toBe(ref.label);
  });
});

describe('injectEntityRefs', () => {
  it('should match entity names case-insensitively', () => {
    const text = 'I spoke with alice about sberbank.';
    const entities = [
      { id: 'a1', name: 'Alice', type: 'Person' },
      { id: 'b2', name: 'Sberbank', type: 'Organization' },
    ];
    const result = injectEntityRefs(text, entities);
    expect(result).toContain('[[Person:a1|Alice]]');
    expect(result).toContain('[[Organization:b2|Sberbank]]');
  });

  it('should handle special regex characters in names', () => {
    const text = 'Using Node.js and React today.';
    const entities = [
      { id: 'n1', name: 'Node.js', type: 'Framework' },
      { id: 'r1', name: 'React', type: 'Framework' },
    ];
    const result = injectEntityRefs(text, entities);
    expect(result).toContain('[[Framework:n1|Node.js]]');
    expect(result).toContain('[[Framework:r1|React]]');
  });

  it('should match longer names first', () => {
    const text = 'Foundation Capital and Capital are different.';
    const entities = [
      { id: 'f1', name: 'Foundation Capital', type: 'Organization' },
      { id: 'c1', name: 'Capital', type: 'Concept' },
    ];
    const result = injectEntityRefs(text, entities);
    expect(result).toContain('[[Organization:f1|Foundation Capital]]');
    // "Capital" standalone should also be replaced
    expect(result).toContain('[[Concept:c1|Capital]]');
  });

  it('should return original text for empty entities', () => {
    expect(injectEntityRefs('hello world', [])).toBe('hello world');
  });

  it('should not match substrings', () => {
    const text = 'The organization is large.';
    const entities = [{ id: 'o1', name: 'organ', type: 'Concept' }];
    const result = injectEntityRefs(text, entities);
    // "organ" should NOT match inside "organization"
    expect(result).not.toContain('[[');
  });
});

describe('ENTITY_REF_REGEX', () => {
  it('should be a global regex', () => {
    expect(ENTITY_REF_REGEX.global).toBe(true);
  });
});
