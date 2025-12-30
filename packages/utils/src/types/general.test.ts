import { describe, expect, it } from 'vitest';
import { SortDirection, sortFactor } from './general';
import type {
  AppVersion,
  SortConfig,
  SortDirectionConfig,
  SortItem,
  TextSelection,
} from './general';

describe('types', () => {
  describe('TextSelection', () => {
    it('should define a valid TextSelection type', () => {
      const selection: TextSelection = {
        start: 0,
        end: 10,
      };

      expect(selection.start).toBe(0);
      expect(selection.end).toBe(10);
      expect(typeof selection.start).toBe('number');
      expect(typeof selection.end).toBe('number');
    });

    it('should allow negative values for start and end', () => {
      const selection: TextSelection = {
        start: -1,
        end: -5,
      };

      expect(selection.start).toBe(-1);
      expect(selection.end).toBe(-5);
    });

    it('should allow equal start and end values', () => {
      const selection: TextSelection = {
        start: 5,
        end: 5,
      };

      expect(selection.start).toBe(5);
      expect(selection.end).toBe(5);
    });
  });

  describe('SortDirection', () => {
    it('should have correct enum values', () => {
      expect(SortDirection.ASC).toBe('asc');
      expect(SortDirection.DESC).toBe('desc');
      expect(SortDirection.DEFAULT).toBe(SortDirection.ASC);
    });

    it('should have all expected enum members', () => {
      const enumValues = Object.values(SortDirection);
      expect(enumValues).toContain('asc');
      expect(enumValues).toContain('desc');
      // DEFAULT is an alias for ASC, so we get 3 values: ['asc', 'desc', 'asc']
      expect(enumValues).toHaveLength(3);

      // Check unique values
      const uniqueValues = [...new Set(enumValues)];
      expect(uniqueValues).toHaveLength(2);
      expect(uniqueValues).toEqual(['asc', 'desc']);
    });

    it('should use ASC as default', () => {
      expect(SortDirection.DEFAULT).toBe('asc');
    });
  });

  describe('sortFactor', () => {
    it('should have correct factor values for each sort direction', () => {
      expect(sortFactor[SortDirection.ASC]).toBe(1);
      expect(sortFactor[SortDirection.DESC]).toBe(-1);
      expect(sortFactor.asc).toBe(1);
      expect(sortFactor.desc).toBe(-1);
    });

    it('should have all sort directions covered', () => {
      const factorKeys = Object.keys(sortFactor);
      expect(factorKeys).toContain('asc');
      expect(factorKeys).toContain('desc');
      expect(factorKeys).toHaveLength(2);
    });

    it('should only contain valid factor values', () => {
      const factorValues = Object.values(sortFactor);
      factorValues.forEach((value) => {
        expect([1, -1, 0]).toContain(value);
      });
    });
  });

  describe('SortDirectionConfig', () => {
    it('should accept SortDirection enum values', () => {
      const config1: SortDirectionConfig = SortDirection.ASC;
      const config2: SortDirectionConfig = SortDirection.DESC;
      const config3: SortDirectionConfig = 'normal';

      expect(config1).toBe('asc');
      expect(config2).toBe('desc');
      expect(config3).toBe('normal');
    });
  });

  describe('SortItem', () => {
    it('should define a valid SortItem tuple', () => {
      const sortItem: SortItem = ['name', SortDirection.ASC];

      expect(sortItem[0]).toBe('name');
      expect(sortItem[1]).toBe(SortDirection.ASC);
      expect(sortItem).toHaveLength(2);
    });

    it('should accept normal as direction', () => {
      const sortItem: SortItem = ['field_id', 'normal'];

      expect(sortItem[0]).toBe('field_id');
      expect(sortItem[1]).toBe('normal');
    });

    it('should accept all SortDirectionConfig values', () => {
      const sortItems: SortItem[] = [
        ['field1', SortDirection.ASC],
        ['field2', SortDirection.DESC],
        ['field3', 'normal'],
      ];

      expect(sortItems).toHaveLength(3);
      sortItems.forEach((item) => {
        expect(typeof item[0]).toBe('string');
        expect(['asc', 'desc', 'normal']).toContain(item[1]);
      });
    });
  });

  describe('SortConfig', () => {
    it('should define an array of SortItem tuples', () => {
      const sortConfig: SortConfig = [
        ['name', SortDirection.ASC],
        ['created_at', SortDirection.DESC],
        ['priority', 'normal'],
      ];

      expect(Array.isArray(sortConfig)).toBe(true);
      expect(sortConfig).toHaveLength(3);

      sortConfig.forEach((item) => {
        expect(Array.isArray(item)).toBe(true);
        expect(item).toHaveLength(2);
        expect(typeof item[0]).toBe('string');
      });
    });

    it('should allow empty array', () => {
      const sortConfig: SortConfig = [];
      expect(Array.isArray(sortConfig)).toBe(true);
      expect(sortConfig).toHaveLength(0);
    });
  });

  describe('AppVersion', () => {
    it('should accept valid semantic version format', () => {
      const version1: AppVersion = '1.0.0';
      const version2: AppVersion = '2.15.3';
      const version3: AppVersion = '10.999.1';

      expect(version1).toBe('1.0.0');
      expect(version2).toBe('2.15.3');
      expect(version3).toBe('10.999.1');
    });

    // Note: TypeScript type checking prevents invalid formats at compile time
    // These tests are more for documentation and runtime validation if needed
    it('should have the correct format pattern', () => {
      const versions: AppVersion[] = ['1.0.0', '2.1.3', '10.25.99'];

      versions.forEach((version) => {
        expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });
  });

  describe('type integration', () => {
    it('should work together in realistic scenarios', () => {
      const textSelection: TextSelection = { start: 0, end: 5 };
      const sortConfig: SortConfig = [
        ['name', SortDirection.ASC],
        ['date', SortDirection.DESC],
      ];
      const appVersion: AppVersion = '1.2.3';

      // Simulate using these types together
      const appState = {
        selection: textSelection,
        sorting: sortConfig,
        version: appVersion,
      };

      expect(appState.selection.start).toBe(0);
      expect(appState.sorting).toHaveLength(2);
      expect(appState.version).toBe('1.2.3');
    });

    it('should handle sortFactor with SortDirection in practical use', () => {
      const direction = SortDirection.DESC;
      const factor = sortFactor[direction];

      // Simulate a comparison function using the factor
      const compareNumbers = (a: number, b: number) => (a - b) * factor;

      expect(compareNumbers(1, 2)).toBe(1); // DESC: 1 > 2 when descending
      expect(compareNumbers(2, 1)).toBe(-1); // DESC: 2 < 1 when descending
      expect(compareNumbers(1, 1)).toBe(-0); // Equal (but -0 due to DESC factor)
    });
  });
});
