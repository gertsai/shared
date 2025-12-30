/**
 * @fileoverview
 * Integration tests for the complete Orchestra DI system.
 * These tests verify that all components work together correctly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventEmitter from 'events';

import type { ConsumerType, IGlobalService, ServiceConsumer } from '../index';
import { AbstractService, createIdentifier, diContainer } from '../index';

// Real-world example: User entity with profile and settings services
class UserEntity
  extends EventEmitter
  implements ConsumerType, ServiceConsumer<'User', UserEntity>
{
  public $sd: any; // Will be set by the DI system

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

// Real-world example: Chat entity with messages and typing services
class ChatEntity extends EventEmitter implements ConsumerType {
  public $sd: any; // Will be set by the DI system

  constructor(private _id: string) {
    super();
  }

  get id() {
    return this._id;
  }

  $destroy() {
    this.emit('destroy');
    this.removeAllListeners();
  }
}

// User profile service
class UserProfileService extends AbstractService<UserEntity> {
  private _profile: { bio: string; avatar: string } | null = null;

  constructor({ consumer }: { consumer: UserEntity }) {
    super({ consumer });
    this.loadProfile();
  }

  private async loadProfile() {
    // Simulate async profile loading
    await new Promise((resolve) => setTimeout(resolve, 10));
    this._profile = {
      bio: `Bio for ${this.Consumer.name}`,
      avatar: `avatar-${this.Consumer.id}.jpg`,
    };
    this._isReady.resolve();
  }

  getProfile() {
    return this._profile;
  }

  updateBio(bio: string) {
    if (this._profile) {
      this._profile.bio = bio;
      this.emit('profile-updated', this._profile);
    }
  }

  $destroy() {
    this._profile = null;
    this.removeAllListeners();
  }
}

// User settings service
class UserSettingsService extends AbstractService<UserEntity> {
  private _settings = {
    theme: 'light',
    notifications: true,
    language: 'en',
  };

  constructor({ consumer }: { consumer: UserEntity }) {
    super({ consumer });
    this._isReady.resolve();
  }

  getSettings() {
    return { ...this._settings };
  }

  updateSetting<K extends keyof typeof this._settings>(
    key: K,
    value: (typeof this._settings)[K],
  ) {
    this._settings[key] = value;
    this.emit('settings-changed', key, value);
  }

  $destroy() {
    this.removeAllListeners();
  }
}

// Chat messages service
class MessagesService extends AbstractService<ChatEntity> {
  private _messages: Array<{ id: string; text: string; timestamp: Date }> = [];

  constructor({ consumer }: { consumer: ChatEntity }) {
    super({ consumer });
    this._isReady.resolve();
  }

  addMessage(text: string) {
    const message = {
      id: `msg-${Date.now()}`,
      text,
      timestamp: new Date(),
    };
    this._messages.push(message);
    this.emit('message-added', message);
    return message;
  }

  getMessages() {
    return [...this._messages];
  }

  $destroy() {
    this._messages = [];
    this.removeAllListeners();
  }
}

// Global logger service
class LoggerService extends AbstractService<null> implements IGlobalService {
  private _logs: Array<{ level: string; message: string; timestamp: Date }> =
    [];

  constructor({ consumer }: { consumer: null }) {
    super({ consumer });
    this._isReady.resolve();
  }

  log(level: string, message: string) {
    const logEntry = {
      level,
      message,
      timestamp: new Date(),
    };
    this._logs.push(logEntry);
    this.emit('logged', logEntry);
  }

  info(message: string) {
    this.log('info', message);
  }

  error(message: string) {
    this.log('error', message);
  }

  getLogs() {
    return [...this._logs];
  }

  $destroy() {
    this._logs = [];
    this.removeAllListeners();
  }
}

// Global configuration service
class ConfigService extends AbstractService<null> implements IGlobalService {
  private _config = {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
    retries: 3,
  };

  constructor({ consumer }: { consumer: null }) {
    super({ consumer });
    this._isReady.resolve();
  }

  get<K extends keyof typeof this._config>(key: K): (typeof this._config)[K] {
    return this._config[key];
  }

  set<K extends keyof typeof this._config>(
    key: K,
    value: (typeof this._config)[K],
  ) {
    this._config[key] = value;
    this.emit('config-changed', key, value);
  }

  $destroy() {
    this.removeAllListeners();
  }
}

describe('Orchestra DI Integration Tests', () => {
  // Service identifiers
  const userProfileId = createIdentifier<UserProfileService, 'profile'>(
    'profile',
  );
  const userSettingsId = createIdentifier<UserSettingsService, 'settings'>(
    'settings',
  );
  const messagesId = createIdentifier<MessagesService, 'messages'>('messages');
  const loggerId = createIdentifier<LoggerService, 'logger'>('logger');
  const configId = createIdentifier<ConfigService, 'config'>('config');

  beforeEach(() => {
    // Register user services
    diContainer.registerService(
      UserEntity,
      userProfileId,
      ({ consumer }) => new UserProfileService({ consumer }),
    );
    diContainer.registerService(
      UserEntity,
      userSettingsId,
      ({ consumer }) => new UserSettingsService({ consumer }),
    );

    // Register chat services
    diContainer.registerService(
      ChatEntity,
      messagesId,
      ({ consumer }) => new MessagesService({ consumer }),
    );

    // Register global services
    diContainer.registerGlobalService(
      loggerId,
      ({ consumer }) => new LoggerService({ consumer }),
    );
    diContainer.registerGlobalService(
      configId,
      ({ consumer }) => new ConfigService({ consumer }),
    );
  });

  describe('Complete user workflow', () => {
    it('should handle a complete user lifecycle with services', async () => {
      // Create a user
      const user = new UserEntity('user-1', 'Alice');
      const userDirectory = diContainer.resolveServiceDirectory(
        'User',
        UserEntity,
        user,
      );
      user.$sd = userDirectory;

      // Get user services
      const profileService = userDirectory.get(userProfileId);
      const settingsService = userDirectory.get(userSettingsId);

      // Verify services are properly initialized
      expect(profileService).toBeInstanceOf(UserProfileService);
      expect(settingsService).toBeInstanceOf(UserSettingsService);
      expect(profileService.Consumer).toBe(user);
      expect(settingsService.Consumer).toBe(user);

      // Wait for async initialization
      await profileService.isReady;
      await settingsService.isReady;

      // Test profile service
      const profile = profileService.getProfile();
      expect(profile).toEqual({
        bio: 'Bio for Alice',
        avatar: 'avatar-user-1.jpg',
      });

      // Test settings service
      const settings = settingsService.getSettings();
      expect(settings).toEqual({
        theme: 'light',
        notifications: true,
        language: 'en',
      });

      // Test service interactions
      const profileUpdateSpy = vi.fn();
      profileService.on('profile-updated', profileUpdateSpy);

      profileService.updateBio('New bio for Alice');
      expect(profileUpdateSpy).toHaveBeenCalledWith({
        bio: 'New bio for Alice',
        avatar: 'avatar-user-1.jpg',
      });

      // Test settings changes
      const settingsChangeSpy = vi.fn();
      settingsService.on('settings-changed', settingsChangeSpy);

      settingsService.updateSetting('theme', 'dark');
      expect(settingsChangeSpy).toHaveBeenCalledWith('theme', 'dark');

      // Cleanup
      user.$destroy();
    });

    it('should handle multiple users with isolated services', async () => {
      // Create two users
      const user1 = new UserEntity('user-1', 'Alice');
      const user2 = new UserEntity('user-2', 'Bob');

      const directory1 = diContainer.resolveServiceDirectory(
        'User',
        UserEntity,
        user1,
      );
      const directory2 = diContainer.resolveServiceDirectory(
        'User',
        UserEntity,
        user2,
      );

      // Get services for both users
      const profile1 = directory1.get(userProfileId);
      const profile2 = directory2.get(userProfileId);
      const settings1 = directory1.get(userSettingsId);
      const settings2 = directory2.get(userSettingsId);

      // Wait for initialization
      await Promise.all([
        profile1.isReady,
        profile2.isReady,
        settings1.isReady,
        settings2.isReady,
      ]);

      // Verify services are isolated
      expect(profile1).not.toBe(profile2);
      expect(settings1).not.toBe(settings2);
      expect(profile1.Consumer).toBe(user1);
      expect(profile2.Consumer).toBe(user2);

      // Verify different data
      expect(profile1.getProfile()?.bio).toBe('Bio for Alice');
      expect(profile2.getProfile()?.bio).toBe('Bio for Bob');

      // Test independent changes
      profile1.updateBio('Alice updated bio');
      profile2.updateBio('Bob updated bio');

      expect(profile1.getProfile()?.bio).toBe('Alice updated bio');
      expect(profile2.getProfile()?.bio).toBe('Bob updated bio');

      // Cleanup
      user1.$destroy();
      user2.$destroy();
    });
  });

  describe('Global services integration', () => {
    it('should provide shared global services across all consumers', async () => {
      // Create different types of consumers
      const user = new UserEntity('user-1', 'Alice');
      const chat = new ChatEntity('chat-1');

      // Get global services from different contexts
      const logger1 = diContainer.$sd.get(loggerId);
      const logger2 = diContainer.$sd.get(loggerId);
      const config1 = diContainer.$sd.get(configId);
      const config2 = diContainer.$sd.get(configId);

      // Global services should be singletons
      expect(logger1).toBe(logger2);
      expect(config1).toBe(config2);

      await Promise.all([logger1.isReady, config1.isReady]);

      // Test logger functionality
      const logSpy = vi.fn();
      logger1.on('logged', logSpy);

      logger1.info('User created');
      logger1.error('Something went wrong');

      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logger1.getLogs()).toHaveLength(2);
      expect(logger1.getLogs()[0].message).toBe('User created');
      expect(logger1.getLogs()[1].message).toBe('Something went wrong');

      // Test config functionality
      const configChangeSpy = vi.fn();
      config1.on('config-changed', configChangeSpy);

      expect(config1.get('apiUrl')).toBe('https://api.example.com');
      config1.set('apiUrl', 'https://api.newdomain.com');
      expect(config1.get('apiUrl')).toBe('https://api.newdomain.com');
      expect(configChangeSpy).toHaveBeenCalledWith(
        'apiUrl',
        'https://api.newdomain.com',
      );

      // Cleanup
      user.$destroy();
      chat.$destroy();
    });
  });

  describe('Chat system integration', () => {
    it('should handle chat functionality with messages service', async () => {
      const chat = new ChatEntity('chat-1');
      const chatDirectory = diContainer.resolveServiceDirectory(
        'Chat',
        ChatEntity,
        chat,
      );

      const messagesService = chatDirectory.get(messagesId);
      expect(messagesService).toBeInstanceOf(MessagesService);
      expect(messagesService.Consumer).toBe(chat);

      await messagesService.isReady;

      // Test message functionality
      const messageAddedSpy = vi.fn();
      messagesService.on('message-added', messageAddedSpy);

      const message1 = messagesService.addMessage('Hello, world!');
      const message2 = messagesService.addMessage('How are you?');

      expect(messageAddedSpy).toHaveBeenCalledTimes(2);
      expect(message1.text).toBe('Hello, world!');
      expect(message2.text).toBe('How are you?');

      const allMessages = messagesService.getMessages();
      expect(allMessages).toHaveLength(2);
      expect(allMessages[0].text).toBe('Hello, world!');
      expect(allMessages[1].text).toBe('How are you?');

      // Cleanup
      chat.$destroy();
    });
  });

  describe('Service lifecycle and cleanup', () => {
    it('should properly clean up all services when consumer is destroyed', async () => {
      const user = new UserEntity('user-1', 'Alice');
      const userDirectory = diContainer.resolveServiceDirectory(
        'User',
        UserEntity,
        user,
      );

      const profileService = userDirectory.get(userProfileId);
      const settingsService = userDirectory.get(userSettingsId);

      await Promise.all([profileService.isReady, settingsService.isReady]);

      // Set up spies
      const profileDestroySpy = vi.spyOn(profileService, '$destroy');
      const settingsDestroySpy = vi.spyOn(settingsService, '$destroy');
      const directoryDestroySpy = vi.spyOn(userDirectory, '$destroy');

      // Destroy the user
      user.$destroy();

      // Verify cleanup
      expect(directoryDestroySpy).toHaveBeenCalledTimes(1);
      expect(profileDestroySpy).toHaveBeenCalledTimes(1);
      expect(settingsDestroySpy).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors gracefully', async () => {
      class FailingService extends AbstractService<UserEntity> {
        constructor({ consumer }: { consumer: UserEntity }) {
          super({ consumer });
          throw new Error('Service initialization failed');
        }

        $destroy() {}
      }

      const failingServiceId = createIdentifier<
        FailingService,
        'failing-service'
      >('failing-service');
      diContainer.registerService(
        UserEntity,
        failingServiceId,
        ({ consumer }) => new FailingService({ consumer }),
      );

      const user = new UserEntity('user-1', 'Alice');
      const userDirectory = diContainer.resolveServiceDirectory(
        'User',
        UserEntity,
        user,
      );

      expect(() => {
        userDirectory.get(failingServiceId);
      }).toThrow('Service initialization failed');

      // Other services should still work
      const profileService = userDirectory.get(userProfileId);
      expect(profileService).toBeInstanceOf(UserProfileService);

      user.$destroy();
    });
  });

  describe('Type safety and service resolution', () => {
    it('should maintain type safety throughout the system', async () => {
      const user = new UserEntity('user-1', 'Alice');
      const userDirectory = diContainer.resolveServiceDirectory(
        'User',
        UserEntity,
        user,
      );

      // TypeScript should ensure these return the correct types
      const profileService = userDirectory.get(userProfileId);
      const settingsService = userDirectory.get(userSettingsId);
      const logger = diContainer.$sd.get(loggerId);

      // Runtime verification of types
      expect(profileService).toBeInstanceOf(UserProfileService);
      expect(settingsService).toBeInstanceOf(UserSettingsService);
      expect(logger).toBeInstanceOf(LoggerService);

      // Verify service-specific methods are available
      expect(typeof profileService.getProfile).toBe('function');
      expect(typeof profileService.updateBio).toBe('function');
      expect(typeof settingsService.getSettings).toBe('function');
      expect(typeof settingsService.updateSetting).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');

      user.$destroy();
    });

    it('should work with complex service interactions', async () => {
      const user = new UserEntity('user-1', 'Alice');
      const userDirectory = diContainer.resolveServiceDirectory(
        'User',
        UserEntity,
        user,
      );

      const profileService = userDirectory.get(userProfileId);
      const settingsService = userDirectory.get(userSettingsId);
      const logger = diContainer.$sd.get(loggerId);

      await Promise.all([
        profileService.isReady,
        settingsService.isReady,
        logger.isReady,
      ]);

      // Get the initial log count (may have logs from previous tests)
      const initialLogCount = logger.getLogs().length;

      // Create a complex interaction between services
      const interactionLog: string[] = [];

      profileService.on('profile-updated', (profile) => {
        logger.info(`Profile updated for ${user.name}: ${profile.bio}`);
        interactionLog.push('profile-updated');
      });

      settingsService.on('settings-changed', (key, value) => {
        logger.info(`Settings changed for ${user.name}: ${key} = ${value}`);
        interactionLog.push('settings-changed');
      });

      logger.on('logged', (entry) => {
        interactionLog.push(`log-${entry.level}`);
      });

      // Trigger interactions
      profileService.updateBio('New bio with logging');
      settingsService.updateSetting('theme', 'dark');

      // Wait a bit for all async events to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify interactions occurred (events may fire in slightly different order)
      expect(interactionLog).toContain('profile-updated');
      expect(interactionLog).toContain('settings-changed');
      expect(interactionLog.filter((log) => log === 'log-info')).toHaveLength(
        2,
      );

      const logs = logger.getLogs();
      const newLogs = logs.slice(initialLogCount);
      expect(newLogs).toHaveLength(2);
      expect(newLogs[0].message).toContain('Profile updated for Alice');
      expect(newLogs[1].message).toContain('Settings changed for Alice');

      user.$destroy();
    });
  });
});
