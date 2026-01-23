# Integration Guide for New Services

## 🎯 Overview

We've successfully integrated two new modular services into the `@gerts/api-rlr` package to improve code organization and maintainability:

1. **PathNormalizer** - Centralizes path normalization logic
2. **KeyGenerator** - Manages Redis key generation and validation

## 📦 What Changed

### 1. PathNormalizer Service

**Location**: `src/services/PathNormalizer.ts`

**Purpose**: Normalizes request paths for consistent bucket identification

**Key Features**:

- Replaces long numeric/UUID segments with `:id`
- Normalizes reaction endpoints
- Removes trailing slashes
- Provides path matching functionality

**Usage Example**:

```typescript
import { PathNormalizer } from '@gerts/api-rlr';

const normalizer = new PathNormalizer();

// Normalize paths
normalizer.normalize('/users/12345678901234567890');
// Returns: '/users/:id'

// Match paths
normalizer.matches('/users/ABC123DEF456', '/users/:id');
// Returns: true
```

### 2. KeyGenerator Service

**Location**: `src/services/KeyGenerator.ts`

**Purpose**: Generates and manages Redis keys for rate limiting

**Key Features**:

- Generates sliding window keys
- Generates bucket keys
- Generates GCRA keys
- Validates key ownership
- Sanitizes key components

**Usage Example**:

```typescript
import { KeyGenerator } from '@gerts/api-rlr';

const generator = new KeyGenerator('rlr:');

// Generate bucket key
generator.generateBucketKey('192.168.1.1', 'get:/api/users');
// Returns: 'rlr:bucket:192.168.1.1:get./api/users'

// Check if key belongs to this instance
generator.isOwnKey('rlr:bucket:user:data');
// Returns: true
```

## 🔄 Integration in RateLimitRequest

The services have been integrated into the main `RateLimitRequest` class:

### Before:

```typescript
// Inline path normalization
const normalizePath = (p: string): string => {
  // ... normalization logic
};
const normPath = normalizePath(rawPath);

// Simple key generation
getKey(ip: string, suffix?: string) {
  return `${ip}${suffix ? ':' + suffix : ''}`;
}
```

### After:

```typescript
// Using PathNormalizer service
private readonly pathNormalizer: PathNormalizer;
const normPath = this.pathNormalizer.normalize(rawPath);

// Using KeyGenerator service
private readonly keyGenerator: KeyGenerator;
getKey(subject: string, suffix?: string) {
  if (suffix) {
    return this.keyGenerator.generateBucketKey(subject, suffix);
  }
  return `${subject}`;
}
```

## ✅ Benefits

1. **Better Separation of Concerns**
   - Path normalization logic is isolated
   - Key generation logic is centralized

2. **Improved Testability**
   - Services can be tested independently
   - Easier to mock for unit tests

3. **Reusability**
   - Services can be used outside of RateLimitRequest
   - Exported for advanced usage scenarios

4. **Consistency**
   - Path normalization is consistent across the codebase
   - Key generation follows a standard format

## 🧪 Testing

All existing tests continue to pass, and new tests have been added:

- `__tests__/services/PathNormalizer.test.ts` - 17 tests
- `__tests__/services/KeyGenerator.test.ts` - 21 tests
- `__tests__/client/rlr-refactored.test.ts` - 10 integration tests

Run tests:

```bash
pnpm test
```

## 🚀 Usage for Advanced Users

The services are now exported from the main package:

```typescript
import { RLRMiddleware, PathNormalizer, KeyGenerator } from '@gerts/api-rlr';

// Use services independently for custom implementations
const normalizer = new PathNormalizer();
const keyGen = new KeyGenerator('custom-prefix:');

// Custom bucket key logic
const customBucketKey = keyGen.generateBucketKey(userApiKey, normalizer.normalize(requestPath));
```

## 📝 Migration Notes

### Breaking Changes

- None! The integration is backward compatible.

### Recommendations

1. For new implementations, consider using the exported services directly
2. When extending RateLimitRequest, leverage the services instead of reimplementing logic
3. Use PathNormalizer.matches() for consistent route matching

## 🔧 Configuration

No configuration changes required. The services are automatically initialized within RateLimitRequest:

```typescript
constructor(options?: RateLimitOptions) {
  // ... existing initialization

  // Services are initialized automatically
  this.pathNormalizer = new PathNormalizer();
  this.keyGenerator = new KeyGenerator(this.prefix);

  // ... rest of initialization
}
```

## 📊 Performance Impact

- **Minimal overhead**: Services are lightweight classes
- **No external dependencies**: Pure TypeScript implementations
- **Efficient patterns**: Compiled regex patterns for performance

## 🎯 Next Steps

### Phase 1: Current (Completed ✅)

- PathNormalizer service
- KeyGenerator service
- Integration with RateLimitRequest

### Phase 2: Future Improvements

- Extract rate limiting strategies into separate services
- Create storage adapter abstraction
- Implement configuration builder pattern

## 💡 Tips

1. **Debugging**: Enable debug mode to see normalized paths and generated keys:

   ```bash
   export RLR_DEBUG=1
   ```

2. **Custom Path Normalization**: Extend PathNormalizer for custom rules:

   ```typescript
   class CustomPathNormalizer extends PathNormalizer {
     normalize(path: string): string {
       // Custom normalization logic
       const normalized = super.normalize(path);
       // Additional custom rules
       return normalized;
     }
   }
   ```

3. **Key Patterns**: Use KeyGenerator.getKeyPatterns() for monitoring:
   ```typescript
   const patterns = keyGenerator.getKeyPatterns();
   // Returns: ['rlr:sw:*', 'rlr:bucket:*', 'rlr:gcra:*', 'rlr:temp:*']
   ```

## 🆘 Support

For questions or issues related to the new services:

1. Check the test files for usage examples
2. Review the service implementations in `src/services/`
3. Refer to the architecture documentation in `ARCHITECTURE_IMPROVEMENTS.md`

The integration maintains full backward compatibility while providing a cleaner, more maintainable codebase for future development.
