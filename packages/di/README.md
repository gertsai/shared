# @orchlab/di

A lightweight, type-safe dependency injection container for TypeScript applications, designed specifically for the Orchestra ecosystem but usable in any TypeScript project.

## Features

- 🔐 **Type-safe**: Full TypeScript support with compile-time type checking
- 🏗️ **Modular**: Support for both consumer-specific and global services
- 🧹 **Memory-safe**: Automatic cleanup and memory leak prevention
- 📦 **Lazy loading**: Services are created only when needed
- 🔄 **Lifecycle management**: Automatic service lifecycle tied to consumer lifecycle
- 🎯 **Vue integration**: Built-in support for Vue reactivity system
- 🧪 **Well-tested**: Comprehensive test suite with 100% coverage

## Installation

```bash
pnpm add @orchlab/di
```

## Quick Start

### 1. Define Your Services

```typescript
import { AbstractService, createIdentifier } from '@orchlab/di';
import type { ConsumerType } from '@orchlab/di';

// Define a consumer (entity that uses services)
class UserEntity extends EventEmitter implements ConsumerType {
  constructor(
    private _id: string,
    private _name: string,
  ) {
    super();
  }

  get id() {
    return this._id;
  }
  get name() {
    return this._name;
  }

  $destroy() {
    this.emit('destroy');
    this.removeAllListeners();
  }
}

// Define a service
class UserProfileService extends AbstractService<UserEntity> {
  private _profile: any = null;

  constructor({ consumer }: { consumer: UserEntity }) {
    super({ consumer });
    this.loadProfile();
  }

  private async loadProfile() {
    // Simulate async loading
    this._profile = { bio: `Profile for ${this.Consumer.name}` };
    this._isReady.resolve(); // Mark service as ready
  }

  getProfile() {
    return this._profile;
  }

  $destroy() {
    this._profile = null;
    this.removeAllListeners();
  }
}
```

### 2. Create Service Identifiers

```typescript
// Create a unique identifier for the service
const profileServiceId = createIdentifier<UserProfileService>('profile');
```

### 3. Register Services

```typescript
import { diContainer } from '@orchlab/di';

// Register the service for the UserEntity consumer type
diContainer.registerService(UserEntity, profileServiceId, ({ consumer }) => {
  return new UserProfileService({ consumer });
});
```

### 4. Use Services

```typescript
// Create a user entity
const user = new UserEntity('user-1', 'Alice');

// Get the service directory for this user
const userDirectory = diContainer.resolveServiceDirectory(
  'User',
  UserEntity,
  user,
);

// Get the profile service (created lazily)
const profileService = userDirectory.get(profileServiceId);

// Wait for the service to be ready
await profileService.isReady;

// Use the service
const profile = profileService.getProfile();
console.log(profile); // { bio: 'Profile for Alice' }

// Cleanup (automatically destroys all services)
user.$destroy();
```

## Core Concepts

### Services

Services are classes that extend `AbstractService<Consumer>` and provide specific functionality for consumers. Services can be:

- **Consumer-specific**: Associated with a particular consumer instance
- **Global**: Singleton services shared across the application

```typescript
// Consumer-specific service
class UserSettingsService extends AbstractService<UserEntity> {
  // Service implementation
}

// Global service
class LoggerService extends AbstractService<null> implements IGlobalService {
  // Global service implementation
}
```

### Consumers

Consumers are entities that use services. They must:

- Extend `EventEmitter`
- Implement `IDestroyable` interface
- Emit a 'destroy' event when being cleaned up

```typescript
class UserEntity extends EventEmitter implements ConsumerType {
  $destroy() {
    this.emit('destroy'); // Important: triggers service cleanup
    this.removeAllListeners();
  }
}
```

### Service Identifiers

Service identifiers are unique, type-safe keys used to register and retrieve services:

```typescript
const profileId = createIdentifier<UserProfileService>('profile');
const settingsId = createIdentifier<UserSettingsService>('settings');
const loggerId = createIdentifier<LoggerService>('logger');
```

### Service Directories

Service directories manage service instances for specific consumers:

- Lazy creation: Services are created only when first requested
- Caching: Same service instance returned on subsequent calls
- Automatic cleanup: All services destroyed when consumer is destroyed

## Advanced Usage

### Global Services

Global services are singletons shared across the entire application:

```typescript
class ConfigService extends AbstractService<null> implements IGlobalService {
  private _config = { apiUrl: 'https://api.example.com' };

  constructor({ consumer }: { consumer: null }) {
    super({ consumer });
    this._isReady.resolve();
  }

  get<K extends keyof typeof this._config>(key: K) {
    return this._config[key];
  }

  $destroy() {
    this.removeAllListeners();
  }
}

const configId = createIdentifier<ConfigService>('config');

// Register global service
diContainer.registerGlobalService(configId, ({ consumer }) => {
  return new ConfigService({ consumer });
});

// Access from anywhere
const config = diContainer.$sd.get(configId);
```

### Service Communication

Services can communicate through events:

```typescript
class NotificationService extends AbstractService<UserEntity> {
  constructor({ consumer }: { consumer: UserEntity }) {
    super({ consumer });
    this._isReady.resolve();
  }

  sendNotification(message: string) {
    this.emit('notification-sent', { message, userId: this.Consumer.id });
  }

  $destroy() {
    this.removeAllListeners();
  }
}

// In another service or component
profileService.on('profile-updated', () => {
  notificationService.sendNotification('Profile updated successfully!');
});
```

### Type-Safe Service Mappings

For better type inference, extend the service type mappings:

```typescript
declare module '@orchlab/di' {
  interface ServiceTypeMapping {
    User: {
      profile: UserProfileService;
      settings: UserSettingsService;
      notifications: NotificationService;
    };
    Chat: {
      messages: MessagesService;
      typing: TypingIndicatorService;
    };
  }

  interface GlobalServiceTypeMapping {
    logger: LoggerService;
    config: ConfigService;
    http: HttpClientService;
  }
}
```

### If you want to declare and register services in separate files

You can declare and register services in separate files.

For example, you can create a file `services.ts` and declare the service type mappings there:

```typescript
declare module '@orchlab/di' {
  // Declare empty interface for service type mapping
  declare interface UserServiceTypeMapping {}
  interface ServiceTypeMapping {
    User: UserServiceTypeMapping;
  }

  interface GlobalServiceTypeMapping {
    logger: LoggerService;
    config: ConfigService;
    http: HttpClientService;
  }
}

// Extend the service type mapping in the another file
declare module '@orchlab/di' {
  interface UserServiceTypeMapping {
    profile: UserProfileService;
  }
}

// Extend the service type mapping in the another file
declare module '@orchlab/di' {
  interface UserServiceTypeMapping {
    settings: UserSettingsService;
  }
}
```

### Service Consumer Interface

Make your consumers implement the `ServiceConsumer` interface for better integration:

```typescript
class UserEntity
  extends EventEmitter
  implements ConsumerType, ServiceConsumer<'User', UserEntity>
{
  public $sd: ServiceDirectory<'User', UserEntity>;

  constructor(id: string, name: string) {
    super();
    // Service directory will be injected by the DI system
    this.$sd = diContainer.resolveServiceDirectory('User', UserEntity, this);
  }

  // Now you can access services directly
  getProfileService() {
    return this.$sd.get(profileServiceId);
  }

  $destroy() {
    this.emit('destroy');
    this.removeAllListeners();
  }
}
```

## Best Practices

### 1. Service Initialization

Always resolve the `_isReady` promise when your service is ready:

```typescript
class DatabaseService extends AbstractService<AppEntity> {
  private _connection: any = null;

  constructor({ consumer }: { consumer: AppEntity }) {
    super({ consumer });
    this.connect();
  }

  private async connect() {
    try {
      this._connection = await connectToDatabase();
      this._isReady.resolve(); // ✅ Mark as ready
    } catch (error) {
      this._isReady.reject(error); // ❌ Mark as failed
    }
  }

  $destroy() {
    this._connection?.close();
    this.removeAllListeners();
  }
}
```

### 2. Memory Management

Always clean up resources in the `$destroy` method:

```typescript
class TimerService extends AbstractService<UserEntity> {
  private _interval: NodeJS.Timeout | null = null;

  constructor({ consumer }: { consumer: UserEntity }) {
    super({ consumer });
    this._interval = setInterval(() => {
      this.emit('tick');
    }, 1000);
    this._isReady.resolve();
  }

  $destroy() {
    if (this._interval) {
      clearInterval(this._interval); // ✅ Clean up timer
      this._interval = null;
    }
    this.removeAllListeners(); // ✅ Clean up event listeners
  }
}
```

### 3. Error Handling

Handle errors gracefully in service methods:

```typescript
class ApiService extends AbstractService<UserEntity> {
  async fetchUserData() {
    await this.isReady; // Wait for service to be ready

    try {
      const response = await fetch('/api/user');
      return await response.json();
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}
```

### 4. Service Dependencies

If a service depends on another service, inject it through the constructor:

```typescript
class UserService extends AbstractService<UserEntity> {
  constructor(
    { consumer }: { consumer: UserEntity },
    private _apiService: ApiService,
    private _logger: LoggerService,
  ) {
    super({ consumer });
    this.initialize();
  }

  private async initialize() {
    await this._apiService.isReady;
    this._logger.info('UserService initialized');
    this._isReady.resolve();
  }
}

// Register with dependencies
diContainer.registerService(UserEntity, userServiceId, ({ consumer }) => {
  const apiService = userDirectory.get(apiServiceId);
  const logger = diContainer.$sd.get(loggerServiceId);
  return new UserService({ consumer }, apiService, logger);
});
```

## Testing

The library includes comprehensive test utilities:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createIdentifier, diContainer } from '@orchlab/di';

describe('MyService', () => {
  let consumer: MyConsumer;
  let service: MyService;

  beforeEach(() => {
    consumer = new MyConsumer();
    const directory = diContainer.resolveServiceDirectory(
      'My',
      MyConsumer,
      consumer,
    );
    service = directory.get(myServiceId);
  });

  it('should initialize correctly', async () => {
    await service.isReady;
    expect(service.Consumer).toBe(consumer);
  });

  it('should clean up properly', () => {
    const destroySpy = vi.spyOn(service, '$destroy');
    consumer.$destroy();
    expect(destroySpy).toHaveBeenCalled();
  });
});
```

## API Reference

### Core Functions

- `createIdentifier<Service>(name: string)` - Creates a type-safe service identifier
- `diContainer.registerService(ConsumerClass, serviceId, factory)` - Registers a consumer-specific service
- `diContainer.registerGlobalService(serviceId, factory)` - Registers a global service
- `diContainer.resolveServiceDirectory(name, ConsumerClass, instance)` - Gets service directory for consumer
- `diContainer.$sd` - Global service directory

### Core Classes

- `AbstractService<Consumer>` - Base class for all services
- `ServiceDirectory<ConsumerClassName, Consumer>` - Manages services for a consumer
- `ServicesRegistry<Consumer>` - Stores service factories

### Interfaces

- `IService<Consumer>` - Interface for consumer-specific services
- `IGlobalService` - Interface for global services
- `ConsumerType` - Base type for service consumers
- `ServiceConsumer<ClassName, Consumer>` - Interface for consumers with service directories

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `pnpm test`
6. Submit a pull request

## License

This project is licensed under the terms specified in the package.json file.
