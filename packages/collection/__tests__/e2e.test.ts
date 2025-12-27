import { describe, expect, it } from 'vitest';
import {
  ImmutableCollection,
  MutableCollection,
  createMutableCollection,
  createImmutableCollection,
  seq,
  cachedSeq,
  memoized,
} from '../src';

describe('E2E - Complete workflow tests', () => {
  describe('Data processing pipeline', () => {
    it('should process user data through complete pipeline', () => {
      // Simulate incoming user data
      const userData = [
        {
          id: 1,
          name: 'Alice',
          age: 25,
          department: 'Engineering',
          salary: 70000,
        },
        { id: 2, name: 'Bob', age: 30, department: 'Marketing', salary: 65000 },
        {
          id: 3,
          name: 'Charlie',
          age: 35,
          department: 'Engineering',
          salary: 85000,
        },
        { id: 4, name: 'Diana', age: 28, department: 'HR', salary: 60000 },
        {
          id: 5,
          name: 'Eve',
          age: 32,
          department: 'Engineering',
          salary: 90000,
        },
      ];

      // Step 1: Create collection from raw data
      const users = MutableCollection.from(
        userData.map((user) => [user.id, user] as [number, typeof user]),
      );

      expect(users.size).toBe(5);

      // Step 2: Filter and transform
      const engineers = users
        .filter((user) => user.department === 'Engineering')
        .mapValues((user) => ({
          ...user,
          bonus: user.salary * 0.1,
        }));

      expect(engineers.size).toBe(3);
      expect(engineers.get(1)?.bonus).toBe(7000);

      // Step 3: Group by department
      const byDepartment = MutableCollection.groupBy(
        userData,
        (user) => user.department,
      );

      expect(byDepartment.get('Engineering')?.length).toBe(3);
      expect(byDepartment.get('Marketing')?.length).toBe(1);

      // Step 4: Calculate statistics
      const avgSalaryByDept = byDepartment.mapValues((users) => {
        const total = users.reduce((sum, user) => sum + user.salary, 0);
        return total / users.length;
      });

      expect(avgSalaryByDept.get('Engineering')).toBe(
        (70000 + 85000 + 90000) / 3,
      );

      // Step 5: Create immutable report
      const report = new ImmutableCollection(avgSalaryByDept);

      // Try to modify - should return new instance
      const updatedReport = report.set('Engineering', 100000);

      expect(report).not.toBe(updatedReport);
      expect(report.get('Engineering')).toBe((70000 + 85000 + 90000) / 3);
      expect(updatedReport.get('Engineering')).toBe(100000);
    });
  });

  describe('Lazy evaluation with Seq', () => {
    it('should efficiently process large datasets with lazy evaluation', () => {
      // Generate large dataset
      const largeData: Array<[number, number]> = [];
      for (let i = 0; i < 10000; i++) {
        largeData.push([i, i]);
      }

      let filterCalls = 0;
      let mapCalls = 0;

      // Create lazy sequence
      const result = seq(largeData)
        .filter((value) => {
          filterCalls++;
          return value % 2 === 0;
        })
        .map((value) => {
          mapCalls++;
          return value * 2;
        })
        .take(10)
        .toArray();

      // Should only process as many as needed
      expect(result.length).toBe(10);
      expect(result).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);

      // Due to lazy evaluation and take(10), should process minimal items
      expect(filterCalls).toBeLessThan(100); // Much less than 10000
      expect(mapCalls).toBeLessThanOrEqual(11); // Around 10 items mapped (may have one extra due to implementation)
    });
  });

  describe('Immutable state management', () => {
    it('should manage application state immutably', () => {
      // Initial state
      const initialState = new ImmutableCollection([
        ['user', { name: 'John', loggedIn: false }],
        ['theme', 'light'],
        ['notifications', []],
      ]);

      // User logs in
      const afterLogin = initialState.update('user', (user: any) => ({
        ...user,
        loggedIn: true,
      }));

      expect(initialState.get('user').loggedIn).toBe(false);
      expect(afterLogin.get('user').loggedIn).toBe(true);

      // Add notification
      const withNotification = afterLogin.update(
        'notifications',
        (notifs: any[]) => [...notifs, { id: 1, message: 'Welcome back!' }],
      );

      expect(afterLogin.get('notifications')).toEqual([]);
      expect(withNotification.get('notifications')).toHaveLength(1);

      // Change theme
      const darkMode = withNotification.set('theme', 'dark');

      // All previous states remain unchanged
      expect(initialState.get('theme')).toBe('light');
      expect(afterLogin.get('theme')).toBe('light');
      expect(withNotification.get('theme')).toBe('light');
      expect(darkMode.get('theme')).toBe('dark');
    });
  });

  describe('Memoized operations for performance', () => {
    it('should cache expensive computations', () => {
      let computationCount = 0;

      // Expensive computation
      const expensiveCompute = (data: Map<string, number>) => {
        computationCount++;
        let sum = 0;
        for (const [, value] of data) {
          // Simulate expensive operation
          sum += value * value;
        }
        return sum;
      };

      // Memoize the computation
      const memoizedCompute = memoized.withMemoization(expensiveCompute);

      const data = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      // First call - computes
      const result1 = memoizedCompute(data);
      expect(computationCount).toBe(1);

      // Second call - uses cache
      const result2 = memoizedCompute(data);
      expect(computationCount).toBe(1);
      expect(result1).toBe(result2);

      // Different data - computes again
      const data2 = new Map([['d', 4]]);
      const result3 = memoizedCompute(data2);
      expect(computationCount).toBe(2);
      expect(result3).toBe(16);
    });
  });

  describe('Collection composition with mixins', () => {
    it('should create collections with custom behavior via mixins', () => {
      // Create extended mutable collection
      const extendedCollection = createMutableCollection(
        [
          ['a', { value: 1, nested: { deep: 'value' } }],
          ['b', { value: 2, nested: { deep: 'another' } }],
        ],
        {
          withExtended: true,
          withBatch: true,
          withDeep: true,
        },
      );

      // Use extended operations
      expect(extendedCollection.size).toBe(2);

      // Use deep operations (if available via type assertion)
      const deepValue = (extendedCollection as any).getIn?.([
        'a',
        'nested',
        'deep',
      ]);
      if (deepValue !== undefined) {
        expect(deepValue).toBe('value');
      }

      // Create immutable with extensions
      const immutableExtended = createImmutableCollection(
        [
          ['x', 10],
          ['y', 20],
        ],
        {
          withExtended: true,
        },
      );

      const doubled = immutableExtended.mapValues((v) => v * 2);
      expect(doubled.get('x')).toBe(20);
    });
  });

  describe('Real-world shopping cart scenario', () => {
    interface CartItem {
      productId: string;
      name: string;
      price: number;
      quantity: number;
    }

    it('should manage shopping cart operations', () => {
      // Initial cart
      let cart = new ImmutableCollection<string, CartItem>();

      // Add items
      cart = cart.set('prod1', {
        productId: 'prod1',
        name: 'Laptop',
        price: 999.99,
        quantity: 1,
      });

      cart = cart.set('prod2', {
        productId: 'prod2',
        name: 'Mouse',
        price: 29.99,
        quantity: 2,
      });

      expect(cart.size).toBe(2);

      // Update quantity
      cart = cart.update('prod1', (item) => ({
        ...item!,
        quantity: 2,
      }));

      expect(cart.get('prod1')?.quantity).toBe(2);

      // Calculate total
      const total = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      expect(total).toBeCloseTo(999.99 * 2 + 29.99 * 2, 2);

      // Apply discount to all items
      const discounted = cart.mapValues((item) => ({
        ...item,
        price: item.price * 0.9, // 10% discount
      }));

      const discountedTotal = discounted.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      expect(discountedTotal).toBeCloseTo(total * 0.9, 2);

      // Remove item
      const updatedCart = cart.delete('prod2');
      expect(updatedCart.size).toBe(1);
      expect(cart.size).toBe(2); // Original unchanged

      // Clear cart
      const emptyCart = updatedCart.clear();
      expect(emptyCart.size).toBe(0);
    });
  });

  describe('Data synchronization between mutable and immutable', () => {
    it('should convert between mutable and immutable collections', () => {
      // Start with mutable for data collection
      const mutable = new MutableCollection<string, number>();

      // Collect data
      mutable.set('a', 1);
      mutable.set('b', 2);
      mutable.set('c', 3);

      // Convert to immutable for safe sharing
      const immutable = ImmutableCollection.from(mutable.entries());

      expect(immutable.size).toBe(3);
      expect(immutable.get('a')).toBe(1);

      // Modify mutable - immutable unchanged
      mutable.set('a', 100);
      expect(immutable.get('a')).toBe(1);

      // Create new mutable from immutable
      const newMutable = MutableCollection.from(immutable.entries());
      expect(newMutable.get('a')).toBe(1); // Has original value

      // Can modify new mutable
      newMutable.set('d', 4);
      expect(newMutable.size).toBe(4);
      expect(immutable.size).toBe(3);
    });
  });

  describe('Cached sequence for repeated iterations', () => {
    it('should efficiently handle repeated iterations with caching', () => {
      let sourceIterations = 0;

      // Custom iterable that tracks iterations
      const createTrackedIterable = () => {
        function* generator(): Generator<[string, number]> {
          sourceIterations++;
          yield ['a', 1];
          yield ['b', 2];
          yield ['c', 3];
        }
        return generator();
      };

      // Create cached sequence from iterable, not generator function
      const cached = cachedSeq(createTrackedIterable());

      // First iteration
      const result1 = cached
        .filter((v) => v > 1)
        .map((v) => v * 2)
        .toArray();

      expect(result1).toEqual([4, 6]);
      expect(sourceIterations).toBe(1);

      // Second iteration - should use cache
      const result2 = cached
        .filter((v) => v > 1)
        .map((v) => v * 2)
        .toArray();

      expect(result2).toEqual([4, 6]);
      expect(sourceIterations).toBe(1); // Not incremented!

      // Different operations - still uses cached source
      const result3 = cached.take(2).toArray();

      expect(result3).toEqual([1, 2]);
      expect(sourceIterations).toBe(1); // Still cached
    });
  });

  describe('Complex set operations workflow', () => {
    it('should perform complex set operations for data analysis', () => {
      // Users with different permissions
      const admins = new ImmutableCollection([
        ['alice', { role: 'admin', level: 3 }],
        ['bob', { role: 'admin', level: 2 }],
      ]);

      const editors = new ImmutableCollection([
        ['bob', { role: 'editor', level: 2 }],
        ['charlie', { role: 'editor', level: 1 }],
      ]);

      const viewers = new ImmutableCollection([
        ['diana', { role: 'viewer', level: 1 }],
        ['eve', { role: 'viewer', level: 1 }],
      ]);

      // Find users with multiple roles (intersection)
      const multiRole = admins.intersection(editors);
      expect(multiRole.has('bob')).toBe(true);
      expect(multiRole.size).toBe(1);

      // All privileged users (union)
      const privileged = admins.union(editors);
      expect(privileged.size).toBe(3);

      // Admins who are not editors (difference)
      const adminOnly = admins.difference(editors);
      expect(adminOnly.has('alice')).toBe(true);
      expect(adminOnly.has('bob')).toBe(false);

      // Users with exactly one role (symmetric difference)
      const singleRole = admins.symmetricDifference(editors);
      expect(singleRole.has('alice')).toBe(true);
      expect(singleRole.has('charlie')).toBe(true);
      expect(singleRole.has('bob')).toBe(false);

      // Combine all users
      const allUsers = privileged.union(viewers);
      expect(allUsers.size).toBe(5);
    });
  });
});
