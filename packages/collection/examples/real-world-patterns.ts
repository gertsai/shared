/**
 * @orchlab/collection - Real-World Patterns & Solutions
 * Practical solutions for common development scenarios
 */

import {
  MutableCollection,
  ImmutableCollection,
  Seq,
  createMutableCollection,
  createImmutableCollection,
  memoize,
  memoizeCollectionOp,
  LRUCache,
  type ReadableCollection,
} from '../src';

// ============================================
// 1. RATE LIMITING & THROTTLING
// ============================================

console.log('\n=== Rate Limiting & Throttling ===\n');

class RateLimiter {
  private requests: MutableCollection<
    string,
    Array<{ timestamp: number; weight: number }>
  >;
  private limits: Map<
    string,
    { requests: number; window: number; burst?: number }
  >;

  constructor() {
    this.requests = new MutableCollection();
    this.limits = new Map([
      ['default', { requests: 60, window: 60000 }], // 60 req/min
      ['api', { requests: 100, window: 60000, burst: 20 }], // 100 req/min with burst
      ['auth', { requests: 5, window: 300000 }], // 5 req/5min
    ]);
  }

  isAllowed(
    clientId: string,
    endpoint: string = 'default',
    weight: number = 1,
  ): boolean {
    const limit = this.limits.get(endpoint) || this.limits.get('default')!;
    const now = Date.now();
    const windowStart = now - limit.window;

    // Get or create request history
    const history = this.requests.get(clientId) || [];

    // Clean old requests
    const validRequests = history.filter((req) => req.timestamp > windowStart);

    // Calculate current usage
    const currentUsage = validRequests.reduce(
      (sum, req) => sum + req.weight,
      0,
    );

    // Check burst limit if applicable
    if (limit.burst) {
      const recentRequests = validRequests.filter(
        (req) => req.timestamp > now - 1000, // Last second
      );
      const burstUsage = recentRequests.reduce(
        (sum, req) => sum + req.weight,
        0,
      );

      if (burstUsage + weight > limit.burst) {
        return false; // Burst limit exceeded
      }
    }

    // Check rate limit
    if (currentUsage + weight > limit.requests) {
      return false; // Rate limit exceeded
    }

    // Add new request
    validRequests.push({ timestamp: now, weight });
    this.requests.set(clientId, validRequests);

    return true;
  }

  getRemainingRequests(clientId: string, endpoint: string = 'default'): number {
    const limit = this.limits.get(endpoint) || this.limits.get('default')!;
    const now = Date.now();
    const windowStart = now - limit.window;

    const history = this.requests.get(clientId) || [];
    const validRequests = history.filter((req) => req.timestamp > windowStart);
    const currentUsage = validRequests.reduce(
      (sum, req) => sum + req.weight,
      0,
    );

    return Math.max(0, limit.requests - currentUsage);
  }

  resetClient(clientId: string) {
    this.requests.delete(clientId);
  }

  cleanup() {
    const now = Date.now();
    const maxWindow = Math.max(
      ...Array.from(this.limits.values()).map((l) => l.window),
    );
    const cutoff = now - maxWindow;

    this.requests.forEach((history, clientId) => {
      const validRequests = history.filter((req) => req.timestamp > cutoff);
      if (validRequests.length === 0) {
        this.requests.delete(clientId);
      } else if (validRequests.length < history.length) {
        this.requests.set(clientId, validRequests);
      }
    });
  }
}

const rateLimiter = new RateLimiter();

// Simulate requests
const client1 = 'user_123';
for (let i = 0; i < 5; i++) {
  const allowed = rateLimiter.isAllowed(client1, 'auth');
  console.log(`Auth request ${i + 1}: ${allowed ? 'Allowed' : 'Blocked'}`);
}

console.log(
  `Remaining requests: ${rateLimiter.getRemainingRequests(client1, 'auth')}`,
);

// ============================================
// 2. EVENT SOURCING & AUDIT LOG
// ============================================

console.log('\n=== Event Sourcing & Audit Log ===\n');

interface Event {
  id: string;
  timestamp: Date;
  type: string;
  userId: string;
  entityId: string;
  data: any;
  metadata?: Record<string, any>;
}

class EventStore {
  private events: ImmutableCollection<string, Event>;
  private snapshots: MutableCollection<
    string,
    { state: any; version: number; timestamp: Date }
  >;
  private projections: Map<string, (events: Event[]) => any>;

  constructor() {
    this.events = new ImmutableCollection();
    this.snapshots = new MutableCollection();
    this.projections = new Map();
  }

  append(event: Omit<Event, 'id' | 'timestamp'>): string {
    const id = this.generateEventId();
    const fullEvent: Event = {
      ...event,
      id,
      timestamp: new Date(),
    };

    this.events = this.events.set(id, fullEvent);

    // Update relevant projections
    this.updateProjections(fullEvent);

    return id;
  }

  getEvents(filter?: {
    entityId?: string;
    userId?: string;
    type?: string;
    from?: Date;
    to?: Date;
  }): Event[] {
    let filtered = this.events;

    if (filter) {
      if (filter.entityId) {
        filtered = filtered.filter((e) => e.entityId === filter.entityId);
      }
      if (filter.userId) {
        filtered = filtered.filter((e) => e.userId === filter.userId);
      }
      if (filter.type) {
        filtered = filtered.filter((e) => e.type === filter.type);
      }
      if (filter.from) {
        filtered = filtered.filter((e) => e.timestamp >= filter.from);
      }
      if (filter.to) {
        filtered = filtered.filter((e) => e.timestamp <= filter.to);
      }
    }

    return Array.from(filtered.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  replay(entityId: string, toVersion?: number): any {
    const events = this.getEvents({ entityId });

    // Check for snapshot
    const snapshot = this.snapshots.get(entityId);
    let state: any = {};
    let startIndex = 0;

    if (snapshot && (!toVersion || snapshot.version <= toVersion)) {
      state = { ...snapshot.state };
      startIndex = snapshot.version;
    }

    // Apply events from snapshot or beginning
    const eventsToApply = toVersion
      ? events.slice(startIndex, toVersion)
      : events.slice(startIndex);

    for (const event of eventsToApply) {
      state = this.applyEvent(state, event);
    }

    return state;
  }

  private applyEvent(state: any, event: Event): any {
    switch (event.type) {
      case 'USER_CREATED':
        return { ...state, ...event.data, version: (state.version || 0) + 1 };

      case 'USER_UPDATED':
        return { ...state, ...event.data, version: (state.version || 0) + 1 };

      case 'USER_DELETED':
        return { ...state, deleted: true, version: (state.version || 0) + 1 };

      default:
        return { ...state, version: (state.version || 0) + 1 };
    }
  }

  createSnapshot(entityId: string) {
    const state = this.replay(entityId);
    const events = this.getEvents({ entityId });

    this.snapshots.set(entityId, {
      state,
      version: events.length,
      timestamp: new Date(),
    });
  }

  registerProjection(name: string, projector: (events: Event[]) => any) {
    this.projections.set(name, projector);
  }

  getProjection(name: string): any {
    const projector = this.projections.get(name);
    if (!projector) return null;

    const events = this.getEvents();
    return projector(events);
  }

  private updateProjections(event: Event) {
    // In production, you'd update only affected projections
    // This is simplified for demonstration
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getAuditTrail(entityId: string): Array<{
    timestamp: Date;
    action: string;
    userId: string;
    changes: any;
  }> {
    const events = this.getEvents({ entityId });

    return events.map((event) => ({
      timestamp: event.timestamp,
      action: event.type,
      userId: event.userId,
      changes: event.data,
    }));
  }
}

const eventStore = new EventStore();

// Simulate user lifecycle
const userId = 'user_456';
eventStore.append({
  type: 'USER_CREATED',
  userId: 'system',
  entityId: userId,
  data: { name: 'John Doe', email: 'john@example.com' },
});

eventStore.append({
  type: 'USER_UPDATED',
  userId: 'admin',
  entityId: userId,
  data: { email: 'john.doe@example.com' },
});

const userState = eventStore.replay(userId);
console.log('Current user state:', userState);

const auditTrail = eventStore.getAuditTrail(userId);
console.log('Audit trail entries:', auditTrail.length);

// ============================================
// 3. DEPENDENCY INJECTION CONTAINER
// ============================================

console.log('\n=== Dependency Injection Container ===\n');

type ServiceFactory<T = any> = () => T | Promise<T>;
type ServiceOptions = {
  singleton?: boolean;
  dependencies?: string[];
  tags?: string[];
};

class DIContainer {
  private services: MutableCollection<
    string,
    {
      factory: ServiceFactory;
      options: ServiceOptions;
      instance?: any;
    }
  >;
  private resolving: Set<string> = new Set();

  constructor() {
    this.services = new MutableCollection();
  }

  register<T>(
    name: string,
    factory: ServiceFactory<T>,
    options: ServiceOptions = {},
  ): this {
    this.services.set(name, {
      factory,
      options: { singleton: true, ...options },
    });
    return this;
  }

  async resolve<T>(name: string): Promise<T> {
    const service = this.services.get(name);

    if (!service) {
      throw new Error(`Service '${name}' not registered`);
    }

    // Check for circular dependencies
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    // Return singleton instance if exists
    if (service.options.singleton && service.instance !== undefined) {
      return service.instance;
    }

    this.resolving.add(name);

    try {
      // Resolve dependencies
      const deps: any[] = [];
      if (service.options.dependencies) {
        for (const dep of service.options.dependencies) {
          deps.push(await this.resolve(dep));
        }
      }

      // Create instance
      const instance = await service.factory.apply(null, deps);

      // Store singleton
      if (service.options.singleton) {
        service.instance = instance;
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  getByTag(tag: string): string[] {
    return Array.from(this.services.entries())
      .filter(([_, service]) => service.options.tags?.includes(tag))
      .map(([name]) => name);
  }

  reset() {
    this.services.forEach((service) => {
      delete service.instance;
    });
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  async resolveMany<T>(names: string[]): Promise<T[]> {
    return Promise.all(names.map((name) => this.resolve<T>(name)));
  }
}

// Example services
class Logger {
  log(message: string) {
    console.log(`[LOG] ${message}`);
  }
}

class Database {
  constructor(private logger: Logger) {}

  async query(sql: string) {
    this.logger.log(`Executing: ${sql}`);
    return [];
  }
}

class UserService {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  async getUser(id: string) {
    this.logger.log(`Getting user ${id}`);
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

// Setup DI container
const container = new DIContainer();

container
  .register('logger', () => new Logger(), { tags: ['core'] })
  .register('database', (logger: Logger) => new Database(logger), {
    dependencies: ['logger'],
    tags: ['core', 'storage'],
  })
  .register(
    'userService',
    (db: Database, logger: Logger) => new UserService(db, logger),
    { dependencies: ['database', 'logger'], tags: ['service'] },
  );

// Resolve services
(async () => {
  const userService = await container.resolve<UserService>('userService');
  await userService.getUser('123');

  const coreServices = container.getByTag('core');
  console.log('Core services:', coreServices);
})();

// ============================================
// 4. GRAPH DATA STRUCTURE
// ============================================

console.log('\n=== Graph Data Structure ===\n');

class Graph<V> {
  private vertices: MutableCollection<string, V>;
  private edges: MutableCollection<string, Set<string>>;
  private weights: MutableCollection<string, number>;

  constructor() {
    this.vertices = new MutableCollection();
    this.edges = new MutableCollection();
    this.weights = new MutableCollection();
  }

  addVertex(id: string, data: V): this {
    this.vertices.set(id, data);
    if (!this.edges.has(id)) {
      this.edges.set(id, new Set());
    }
    return this;
  }

  addEdge(from: string, to: string, weight: number = 1): this {
    if (!this.vertices.has(from) || !this.vertices.has(to)) {
      throw new Error('Vertex not found');
    }

    this.edges.get(from)!.add(to);
    this.weights.set(`${from}->${to}`, weight);
    return this;
  }

  addBidirectionalEdge(v1: string, v2: string, weight: number = 1): this {
    this.addEdge(v1, v2, weight);
    this.addEdge(v2, v1, weight);
    return this;
  }

  getNeighbors(vertex: string): string[] {
    return Array.from(this.edges.get(vertex) || []);
  }

  // Breadth-first search
  bfs(start: string, target?: string): string[] {
    const visited = new Set<string>();
    const queue = [start];
    const path: string[] = [];

    while (queue.length > 0) {
      const vertex = queue.shift()!;

      if (visited.has(vertex)) continue;

      visited.add(vertex);
      path.push(vertex);

      if (vertex === target) break;

      const neighbors = this.getNeighbors(vertex);
      queue.push(...neighbors.filter((n) => !visited.has(n)));
    }

    return path;
  }

  // Depth-first search
  dfs(start: string, target?: string): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const visit = (vertex: string): boolean => {
      if (visited.has(vertex)) return false;

      visited.add(vertex);
      path.push(vertex);

      if (vertex === target) return true;

      const neighbors = this.getNeighbors(vertex);
      for (const neighbor of neighbors) {
        if (visit(neighbor)) return true;
      }

      return false;
    };

    visit(start);
    return path;
  }

  // Dijkstra's shortest path
  shortestPath(
    start: string,
    end: string,
  ): { path: string[]; distance: number } {
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set(this.vertices.keys());

    // Initialize distances
    for (const vertex of this.vertices.keys()) {
      distances.set(vertex, vertex === start ? 0 : Infinity);
      previous.set(vertex, null);
    }

    while (unvisited.size > 0) {
      // Find unvisited vertex with minimum distance
      let current: string | null = null;
      let minDistance = Infinity;

      for (const vertex of unvisited) {
        const distance = distances.get(vertex)!;
        if (distance < minDistance) {
          current = vertex;
          minDistance = distance;
        }
      }

      if (!current || minDistance === Infinity) break;

      unvisited.delete(current);

      if (current === end) break;

      // Update distances to neighbors
      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor)) continue;

        const weight = this.weights.get(`${current}->${neighbor}`) || 1;
        const alternativeDist = distances.get(current)! + weight;

        if (alternativeDist < distances.get(neighbor)!) {
          distances.set(neighbor, alternativeDist);
          previous.set(neighbor, current);
        }
      }
    }

    // Reconstruct path
    const path: string[] = [];
    let current: string | null = end;

    while (current) {
      path.unshift(current);
      current = previous.get(current) || null;
    }

    return {
      path: path[0] === start ? path : [],
      distance: distances.get(end) || Infinity,
    };
  }

  // Detect cycles
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (vertex: string): boolean => {
      visited.add(vertex);
      recursionStack.add(vertex);

      const neighbors = this.getNeighbors(vertex);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycleDFS(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(vertex);
      return false;
    };

    for (const vertex of this.vertices.keys()) {
      if (!visited.has(vertex)) {
        if (hasCycleDFS(vertex)) return true;
      }
    }

    return false;
  }
}

// Example: Social network
const socialGraph = new Graph<{ name: string; age: number }>();

socialGraph
  .addVertex('alice', { name: 'Alice', age: 30 })
  .addVertex('bob', { name: 'Bob', age: 25 })
  .addVertex('charlie', { name: 'Charlie', age: 35 })
  .addVertex('diana', { name: 'Diana', age: 28 })
  .addBidirectionalEdge('alice', 'bob')
  .addBidirectionalEdge('alice', 'charlie')
  .addBidirectionalEdge('bob', 'diana')
  .addBidirectionalEdge('charlie', 'diana');

const path = socialGraph.shortestPath('alice', 'diana');
console.log('Shortest path from Alice to Diana:', path.path.join(' -> '));

// ============================================
// 5. TASK QUEUE & JOB SCHEDULER
// ============================================

console.log('\n=== Task Queue & Job Scheduler ===\n');

interface Task<T = any> {
  id: string;
  type: string;
  payload: T;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  scheduledFor?: Date;
  lastAttempt?: Date;
  error?: string;
}

class TaskQueue<T = any> {
  private queue: MutableCollection<string, Task<T>>;
  private processing: Set<string> = new Set();
  private handlers: Map<string, (payload: T) => Promise<void>> = new Map();
  private dlq: MutableCollection<string, Task<T>>; // Dead letter queue

  constructor() {
    this.queue = new MutableCollection();
    this.dlq = new MutableCollection();
  }

  registerHandler(type: string, handler: (payload: T) => Promise<void>) {
    this.handlers.set(type, handler);
  }

  enqueue(
    type: string,
    payload: T,
    options: {
      priority?: number;
      maxRetries?: number;
      scheduledFor?: Date;
    } = {},
  ): string {
    const id = this.generateTaskId();
    const task: Task<T> = {
      id,
      type,
      payload,
      priority: options.priority || 0,
      retries: 0,
      maxRetries: options.maxRetries || 3,
      createdAt: new Date(),
      scheduledFor: options.scheduledFor,
    };

    this.queue.set(id, task);
    return id;
  }

  async process(concurrency: number = 1): Promise<void> {
    const tasks = this.getNextTasks(concurrency);

    if (tasks.length === 0) return;

    await Promise.all(tasks.map((task) => this.processTask(task)));
  }

  private getNextTasks(count: number): Task<T>[] {
    const now = new Date();

    // Get all eligible tasks
    const eligible = Array.from(this.queue.values())
      .filter((task) => {
        // Skip if already processing
        if (this.processing.has(task.id)) return false;

        // Skip if scheduled for future
        if (task.scheduledFor && task.scheduledFor > now) return false;

        return true;
      })
      .sort((a, b) => {
        // Sort by priority (higher first), then by creation time
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    return eligible.slice(0, count);
  }

  private async processTask(task: Task<T>): Promise<void> {
    const handler = this.handlers.get(task.type);

    if (!handler) {
      console.error(`No handler for task type: ${task.type}`);
      this.moveToDeadLetter(task, 'No handler found');
      return;
    }

    this.processing.add(task.id);
    task.lastAttempt = new Date();

    try {
      await handler(task.payload);

      // Success - remove from queue
      this.queue.delete(task.id);
      console.log(`Task ${task.id} completed successfully`);
    } catch (error) {
      task.retries++;
      task.error = String(error);

      if (task.retries >= task.maxRetries) {
        // Move to dead letter queue
        this.moveToDeadLetter(task, String(error));
      } else {
        // Exponential backoff
        const delay = Math.pow(2, task.retries) * 1000;
        task.scheduledFor = new Date(Date.now() + delay);
        console.log(
          `Task ${task.id} failed, retry ${task.retries}/${task.maxRetries}`,
        );
      }
    } finally {
      this.processing.delete(task.id);
    }
  }

  private moveToDeadLetter(task: Task<T>, reason: string) {
    this.queue.delete(task.id);
    task.error = reason;
    this.dlq.set(task.id, task);
    console.log(`Task ${task.id} moved to DLQ: ${reason}`);
  }

  getStatus() {
    return {
      pending: this.queue.size - this.processing.size,
      processing: this.processing.size,
      deadLetter: this.dlq.size,
      scheduled: Array.from(this.queue.values()).filter(
        (t) => t.scheduledFor && t.scheduledFor > new Date(),
      ).length,
    };
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Example usage
const taskQueue = new TaskQueue();

// Register handlers
taskQueue.registerHandler('email', async (payload: any) => {
  console.log(`Sending email to ${payload.to}`);
  // Simulate email sending
  if (Math.random() > 0.8) {
    throw new Error('Email service unavailable');
  }
});

taskQueue.registerHandler('webhook', async (payload: any) => {
  console.log(`Calling webhook: ${payload.url}`);
  // Simulate webhook call
});

// Enqueue tasks
taskQueue.enqueue(
  'email',
  { to: 'user@example.com', subject: 'Welcome!' },
  { priority: 1 },
);
taskQueue.enqueue(
  'webhook',
  { url: 'https://api.example.com/hook' },
  { priority: 0 },
);
taskQueue.enqueue(
  'email',
  { to: 'admin@example.com', subject: 'Alert' },
  {
    priority: 2,
    scheduledFor: new Date(Date.now() + 5000), // Schedule for 5 seconds later
  },
);

// Process queue
(async () => {
  await taskQueue.process(2); // Process up to 2 tasks concurrently
  console.log('Queue status:', taskQueue.getStatus());
})();

// ============================================
// SUMMARY
// ============================================

console.log('\n' + '='.repeat(50));
console.log('✅ Real-world patterns demonstrated!');
console.log('='.repeat(50));

console.log(`
Patterns Implemented:
- Rate Limiting & Throttling
- Event Sourcing & Audit Logging
- Dependency Injection Container
- Graph Data Structure with Algorithms
- Task Queue & Job Scheduler

Key Benefits:
- Production-ready patterns
- Scalable architectures
- Performance optimizations
- Error handling & recovery
- Real-world use cases
`);
