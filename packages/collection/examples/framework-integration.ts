/**
 * @orchlab/collection - Framework Integration Examples
 * Shows how to use the library with popular frameworks
 */

import {
  ImmutableCollection,
  MutableCollection,
  ReactiveCollection,
  createImmutableCollection,
  type ReadableCollection,
} from '../src';

// ============================================
// 1. REACT INTEGRATION
// ============================================

console.log('\n=== React Integration Patterns ===\n');

// Custom React hook for collections
interface UseCollectionOptions<K, V> {
  initial?: Iterable<[K, V]>;
  mutable?: boolean;
}

function useCollection<K, V>(options: UseCollectionOptions<K, V> = {}) {
  // This is a conceptual example - in real React app you'd use useState/useReducer
  const { initial = [], mutable = false } = options;

  // In real implementation:
  // const [collection, setCollection] = useState(() =>
  //   mutable ? new MutableCollection(initial) : new ImmutableCollection(initial)
  // );

  const collection = mutable
    ? new MutableCollection(initial)
    : new ImmutableCollection(initial);

  const methods = {
    set: (key: K, value: V) => {
      if (mutable) {
        (collection as MutableCollection<K, V>).set(key, value);
      } else {
        // In React: setCollection(prev => prev.set(key, value))
        return (collection as ImmutableCollection<K, V>).set(key, value);
      }
    },

    delete: (key: K) => {
      if (mutable) {
        return (collection as MutableCollection<K, V>).delete(key);
      } else {
        // In React: setCollection(prev => prev.delete(key))
        return (collection as ImmutableCollection<K, V>).delete(key);
      }
    },

    clear: () => {
      if (mutable) {
        (collection as MutableCollection<K, V>).clear();
      } else {
        // In React: setCollection(prev => prev.clear())
        return (collection as ImmutableCollection<K, V>).clear();
      }
    },
  };

  return [collection, methods] as const;
}

// Example React component state
interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}

// Simulated React component
class TodoListComponent {
  private todos: ImmutableCollection<string, TodoItem>;

  constructor() {
    this.todos = new ImmutableCollection();
  }

  addTodo(text: string) {
    const id = Date.now().toString();
    const newTodo: TodoItem = {
      id,
      text,
      completed: false,
      createdAt: new Date(),
    };

    // In React component:
    // setTodos(prev => prev.set(id, newTodo))
    this.todos = this.todos.set(id, newTodo);
    this.render();
  }

  toggleTodo(id: string) {
    // In React component with immutable updates
    this.todos = this.todos.update(id, (todo) =>
      todo ? { ...todo, completed: !todo.completed } : todo,
    );
    this.render();
  }

  getFilteredTodos(filter: 'all' | 'active' | 'completed') {
    switch (filter) {
      case 'active':
        return this.todos.filter((todo) => !todo.completed);
      case 'completed':
        return this.todos.filter((todo) => todo.completed);
      default:
        return this.todos;
    }
  }

  render() {
    console.log(`Rendering ${this.todos.size} todos`);
  }
}

const todoApp = new TodoListComponent();
todoApp.addTodo('Learn collections');
todoApp.addTodo('Build app');
todoApp.toggleTodo(Array.from(todoApp['todos'].keys())[0]);

// ============================================
// 2. VUE.JS INTEGRATION
// ============================================

console.log('\n=== Vue.js Integration ===\n');

// Vue 3 Composition API integration
interface VueComposableOptions<K, V> {
  immediate?: boolean;
  deep?: boolean;
}

function useReactiveCollection<K, V>(
  initial: Iterable<[K, V]> = [],
  options: VueComposableOptions<K, V> = {},
) {
  // In real Vue app:
  // const collection = reactive(new MutableCollection(initial));
  // or
  // const collection = ref(new ImmutableCollection(initial));

  const collection = new MutableCollection(initial);

  // Computed properties
  const size = () => collection.size;
  const isEmpty = () => collection.size === 0;
  const keys = () => Array.from(collection.keys());
  const values = () => Array.from(collection.values());

  // Methods
  const set = (key: K, value: V) => {
    collection.set(key, value);
    // In Vue: triggers reactivity automatically
  };

  const remove = (key: K) => {
    return collection.delete(key);
  };

  const update = (key: K, updater: (value: V | undefined) => V) => {
    const current = collection.get(key);
    const newValue = updater(current);
    collection.set(key, newValue);
  };

  // Watchers
  const watch = (callback: (collection: MutableCollection<K, V>) => void) => {
    // In real Vue:
    // watch(collection, callback, { deep: options.deep });
    callback(collection);
  };

  return {
    collection,
    size,
    isEmpty,
    keys,
    values,
    set,
    remove,
    update,
    watch,
  };
}

// Vue component example
class VueShoppingCart {
  private cart = useReactiveCollection<
    string,
    { product: string; quantity: number; price: number }
  >();

  addItem(productId: string, product: string, price: number) {
    const existing = this.cart.collection.get(productId);
    if (existing) {
      this.cart.update(productId, (item) => ({
        ...item!,
        quantity: item!.quantity + 1,
      }));
    } else {
      this.cart.set(productId, { product, quantity: 1, price });
    }
  }

  removeItem(productId: string) {
    this.cart.remove(productId);
  }

  get total() {
    return Array.from(this.cart.collection.values()).reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
  }

  get itemCount() {
    return Array.from(this.cart.collection.values()).reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
  }
}

const cart = new VueShoppingCart();
cart.addItem('p1', 'Laptop', 999);
cart.addItem('p2', 'Mouse', 29);
cart.addItem('p1', 'Laptop', 999); // Increases quantity
console.log(`Cart total: $${cart.total}, Items: ${cart.itemCount}`);

// ============================================
// 3. REDUX INTEGRATION
// ============================================

console.log('\n=== Redux Integration ===\n');

// Redux state shape with collections
interface ReduxState {
  entities: {
    users: ImmutableCollection<
      string,
      { id: string; name: string; email: string }
    >;
    posts: ImmutableCollection<
      string,
      { id: string; userId: string; title: string; content: string }
    >;
    comments: ImmutableCollection<
      string,
      { id: string; postId: string; userId: string; text: string }
    >;
  };
  ui: {
    selectedUserId: string | null;
    loading: boolean;
  };
}

// Action types
type Action =
  | { type: 'ADD_USER'; payload: { id: string; name: string; email: string } }
  | {
      type: 'ADD_POST';
      payload: { id: string; userId: string; title: string; content: string };
    }
  | { type: 'DELETE_POST'; payload: string }
  | {
      type: 'UPDATE_USER';
      payload: {
        id: string;
        updates: Partial<{ name: string; email: string }>;
      };
    }
  | {
      type: 'BATCH_ADD_POSTS';
      payload: Array<{
        id: string;
        userId: string;
        title: string;
        content: string;
      }>;
    }
  | { type: 'SET_LOADING'; payload: boolean };

// Redux reducer using ImmutableCollection
function entitiesReducer(
  state: ReduxState['entities'] = {
    users: new ImmutableCollection(),
    posts: new ImmutableCollection(),
    comments: new ImmutableCollection(),
  },
  action: Action,
): ReduxState['entities'] {
  switch (action.type) {
    case 'ADD_USER':
      return {
        ...state,
        users: state.users.set(action.payload.id, action.payload),
      };

    case 'ADD_POST':
      return {
        ...state,
        posts: state.posts.set(action.payload.id, action.payload),
      };

    case 'DELETE_POST':
      return {
        ...state,
        posts: state.posts.delete(action.payload),
      };

    case 'UPDATE_USER': {
      const { id, updates } = action.payload;
      return {
        ...state,
        users: state.users.update(id, (user) =>
          user ? { ...user, ...updates } : user,
        ),
      };
    }

    case 'BATCH_ADD_POSTS':
      return {
        ...state,
        posts: state.posts.withMutations((mutable) => {
          action.payload.forEach((post) => {
            mutable.set(post.id, post);
          });
        }),
      };

    default:
      return state;
  }
}

// Selectors using collections
const selectUserById = (state: ReduxState, userId: string) =>
  state.entities.users.get(userId);

const selectPostsByUser = (state: ReduxState, userId: string) =>
  state.entities.posts.filter((post) => post.userId === userId);

const selectUsersWithPosts = (state: ReduxState) => {
  const usersWithPosts = new Map<string, number>();

  state.entities.posts.forEach((post) => {
    const count = usersWithPosts.get(post.userId) || 0;
    usersWithPosts.set(post.userId, count + 1);
  });

  return state.entities.users.map((user) => ({
    ...user,
    postCount: usersWithPosts.get(user.id) || 0,
  }));
};

// Simulate Redux store
let reduxState: ReduxState = {
  entities: entitiesReducer(undefined, { type: '@@INIT' } as any),
  ui: { selectedUserId: null, loading: false },
};

// Dispatch actions
const dispatch = (action: Action) => {
  reduxState = {
    ...reduxState,
    entities: entitiesReducer(reduxState.entities, action),
  };
};

dispatch({
  type: 'ADD_USER',
  payload: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
});
dispatch({
  type: 'ADD_POST',
  payload: { id: 'p1', userId: 'u1', title: 'First Post', content: 'Hello!' },
});
dispatch({
  type: 'ADD_POST',
  payload: {
    id: 'p2',
    userId: 'u1',
    title: 'Second Post',
    content: 'More content',
  },
});

console.log('User posts:', selectPostsByUser(reduxState, 'u1').size);

// ============================================
// 4. MOBX INTEGRATION
// ============================================

console.log('\n=== MobX Integration ===\n');

// MobX observable collection wrapper
class ObservableCollection<K, V> {
  private collection: MutableCollection<K, V>;
  // In real MobX: @observable decorator

  constructor(initial?: Iterable<[K, V]>) {
    // In real MobX: makeObservable(this)
    this.collection = new MutableCollection(initial);
  }

  // @action
  set(key: K, value: V) {
    this.collection.set(key, value);
  }

  // @action
  delete(key: K) {
    return this.collection.delete(key);
  }

  // @action
  clear() {
    this.collection.clear();
  }

  // @action
  merge(other: ReadableCollection<K, V>) {
    other.forEach((value, key) => {
      this.collection.set(key, value);
    });
  }

  // @computed
  get size() {
    return this.collection.size;
  }

  // @computed
  get isEmpty() {
    return this.collection.size === 0;
  }

  // @computed
  get entries() {
    return Array.from(this.collection.entries());
  }

  filter(predicate: (value: V, key: K) => boolean) {
    return this.collection.filter(predicate);
  }

  map<R>(mapper: (value: V, key: K) => R) {
    return this.collection.map(mapper);
  }
}

// MobX store example
class TodoStore {
  todos = new ObservableCollection<string, TodoItem>();
  filter: 'all' | 'active' | 'completed' = 'all';

  // @action
  addTodo(text: string) {
    const id = Date.now().toString();
    this.todos.set(id, {
      id,
      text,
      completed: false,
      createdAt: new Date(),
    });
  }

  // @action
  toggleTodo(id: string) {
    const todo = this.todos.collection.get(id);
    if (todo) {
      this.todos.set(id, { ...todo, completed: !todo.completed });
    }
  }

  // @action
  removeTodo(id: string) {
    this.todos.delete(id);
  }

  // @computed
  get filteredTodos() {
    switch (this.filter) {
      case 'active':
        return this.todos.filter((todo) => !todo.completed);
      case 'completed':
        return this.todos.filter((todo) => todo.completed);
      default:
        return this.todos.collection;
    }
  }

  // @computed
  get stats() {
    const all = this.todos.size;
    const completed = this.todos.filter((todo) => todo.completed).size;
    const active = all - completed;

    return { all, active, completed };
  }
}

const mobxStore = new TodoStore();
mobxStore.addTodo('Learn MobX');
mobxStore.addTodo('Use collections');
console.log('MobX todos stats:', mobxStore.stats);

// ============================================
// 5. EXPRESS/NODE.JS INTEGRATION
// ============================================

console.log('\n=== Express/Node.js Integration ===\n');

// In-memory session store using collections
class SessionStore {
  private sessions: MutableCollection<
    string,
    {
      userId: string;
      data: any;
      createdAt: Date;
      lastAccess: Date;
      expires: Date;
    }
  >;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private ttl: number = 3600000) {
    // 1 hour default
    this.sessions = new MutableCollection();

    // Cleanup expired sessions periodically
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
    // Allow process to exit even with interval running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  create(userId: string, data: any = {}): string {
    const sessionId = this.generateSessionId();
    const now = new Date();

    this.sessions.set(sessionId, {
      userId,
      data,
      createdAt: now,
      lastAccess: now,
      expires: new Date(now.getTime() + this.ttl),
    });

    return sessionId;
  }

  get(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) return null;

    if (session.expires < new Date()) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last access
    session.lastAccess = new Date();
    session.expires = new Date(Date.now() + this.ttl);

    return session;
  }

  destroy(sessionId: string) {
    return this.sessions.delete(sessionId);
  }

  getUserSessions(userId: string) {
    return this.sessions.filter((session) => session.userId === userId);
  }

  cleanup() {
    const now = new Date();
    const expired = this.sessions
      .filter((session) => session.expires < now)
      .keys();

    for (const sessionId of expired) {
      this.sessions.delete(sessionId);
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  getStats() {
    const now = new Date();
    const active = this.sessions.filter((s) => s.expires > now).size;
    const expired = this.sessions.filter((s) => s.expires <= now).size;

    return {
      total: this.sessions.size,
      active,
      expired,
    };
  }
}

// Request cache middleware
class RequestCache {
  private cache: ImmutableCollection<
    string,
    {
      data: any;
      timestamp: Date;
      ttl: number;
    }
  >;

  constructor() {
    this.cache = new ImmutableCollection();
  }

  middleware() {
    return (req: any, res: any, next: () => void) => {
      const key = this.getCacheKey(req);
      const cached = this.cache.get(key);

      if (cached && this.isValid(cached)) {
        console.log(`Cache hit: ${key}`);
        res.locals.cached = cached.data;
        return res.json(cached.data);
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json to cache response
      res.json = (data: any) => {
        this.cache = this.cache.set(key, {
          data,
          timestamp: new Date(),
          ttl: 60000, // 1 minute
        });

        return originalJson(data);
      };

      next();
    };
  }

  private getCacheKey(req: any): string {
    return `${req.method}:${req.path}:${JSON.stringify(req.query)}`;
  }

  private isValid(cached: { timestamp: Date; ttl: number }): boolean {
    return cached.timestamp.getTime() + cached.ttl > Date.now();
  }

  invalidate(pattern?: string) {
    if (pattern) {
      this.cache = this.cache.filter((_, key) => !key.includes(pattern));
    } else {
      this.cache = this.cache.clear();
    }
  }
}

const sessionStore = new SessionStore();
const session1 = sessionStore.create('user1', { theme: 'dark' });
const session2 = sessionStore.create('user1', { theme: 'light' });
console.log('Session store stats:', sessionStore.getStats());

const requestCache = new RequestCache();
// In Express: app.use(requestCache.middleware())

// Clean up to allow process to exit
sessionStore.destroy();

// ============================================
// SUMMARY
// ============================================

console.log('\n' + '='.repeat(50));
console.log('✅ Framework integration examples completed!');
console.log('='.repeat(50));

console.log(`
Frameworks Covered:
- React: Hooks, immutable state management
- Vue.js: Composition API, reactive collections
- Redux: Immutable reducers, selectors
- MobX: Observable collections, computed values
- Express/Node.js: Session store, request cache

Key Integration Patterns:
- State management with immutable collections
- Reactive updates and subscriptions
- Caching and memoization
- Session and request handling
- Performance optimization
`);
