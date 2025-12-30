import { describe, expect, it } from 'vitest';
import {
  boldRegexp,
  codeRegexp,
  emailRegexp,
  expandableRegexp,
  inlineCodeRegexp,
  italicRegexp,
  markdownUrlRegexp,
  mentionRegexp,
  plainUrlRegexp,
  regexpToString,
  strikeRegexp,
  tagsRegexp,
  timeRegexp,
  underlineRegexp,
} from './regexp';

describe('regexp', () => {
  describe('regexpToString', () => {
    it('should convert a simple regexp to a string', () => {
      const result = regexpToString(/ab?c/);
      expect(result).toBe('ab?c');
    });

    it('should handle more complex regexps', () => {
      const result = regexpToString(/^(?:[a-z]{2,})?\/[0-9]{1,3}\/[a-zA-Z]+$/);
      expect(result).toBe('(?:[a-z]{2,})?\\/[0-9]{1,3}\\/[a-zA-Z]+');
    });

    it('should remove group names', () => {
      const result = regexpToString(
        /^(?<name>[a-z]{2,})\/(?<id>[0-9]{1,3})\/(?<type>[a-zA-Z]+)$/,
      );
      expect(result).toBe('(?:[a-z]{2,})\\/(?:[0-9]{1,3})\\/(?:[a-zA-Z]+)');
    });
  });

  describe('codeRegexp', () => {
    it('should match code blocks with language', () => {
      const match = '```javascript\nconst x = 1;\n```'.match(codeRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.language).toBe('javascript');
      expect(match?.groups?.content).toBe('const x = 1;\n');
    });

    it('should match code blocks without language', () => {
      const match = '```\nconst x = 1;\n```'.match(codeRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.language).toBeUndefined();
      expect(match?.groups?.content).toBe('\nconst x = 1;\n');
    });
  });

  describe('expandableRegexp', () => {
    it('should match expandable content', () => {
      const match = '[[[expandable content]]]'.match(expandableRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.content).toBe('expandable content');
    });
  });

  describe('mentionRegexp', () => {
    it('should match a user mention', () => {
      const match = '<!user@12345678901234567890[John Doe]>'.match(
        mentionRegexp,
      );
      expect(match).not.toBeNull();
      expect(match?.groups?.target_type).toBe('user');
      expect(match?.groups?.target_uid).toBe('12345678901234567890');
      expect(match?.groups?.shown_text).toBe('John Doe');
    });
  });

  describe('timeRegexp', () => {
    it('should match a time with offset', () => {
      const match = '<!time@14:30/-60[2:30 PM]>'.match(timeRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.time).toBe('14:30');
      expect(match?.groups?.offset).toBe('-60');
      expect(match?.groups?.shown_text).toBe('2:30 PM');
    });
  });

  describe('inlineCodeRegexp', () => {
    it('should match inline code', () => {
      const match = '`const x = 1;`'.match(inlineCodeRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.content).toBe('const x = 1;');
    });
  });

  describe('emailRegexp', () => {
    it('should match a valid email', () => {
      expect(emailRegexp.test('test@example.com')).toBe(true);
    });

    it('should not match an invalid email', () => {
      expect(emailRegexp.test('test@example')).toBe(false);
    });
  });

  describe('tagsRegexp', () => {
    it('should match a valid tag', () => {
      const match = ':TODO'.match(tagsRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.tag).toBe('TODO');
    });
  });

  describe('boldRegexp', () => {
    it('should match bold text', () => {
      const match = '**bold text**'.match(boldRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.bold_content).toBe('bold text');
    });
  });

  describe('italicRegexp', () => {
    it('should match italic text', () => {
      const match = '*italic text*'.match(italicRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.italic_content).toBe('italic text');
    });
  });

  describe('underlineRegexp', () => {
    it('should match underline text', () => {
      const match = '__underline text__'.match(underlineRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.underline_content).toBe('underline text');
    });
  });

  describe('strikeRegexp', () => {
    it('should match strike text', () => {
      const match = '~~strike text~~'.match(strikeRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.strike_content).toBe('strike text');
    });
  });

  describe('plainUrlRegexp', () => {
    it('should match a plain URL', () => {
      expect(plainUrlRegexp.test('http://example.com')).toBe(true);
    });
  });

  describe('markdownUrlRegexp', () => {
    it('should match a markdown URL', () => {
      const match = '[example](http://example.com)'.match(markdownUrlRegexp);
      expect(match).not.toBeNull();
      expect(match?.groups?.text).toBe('example');
      expect(match?.groups?.url).toBe('http://example.com');
    });
  });
});
