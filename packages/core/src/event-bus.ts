export type EventHandler<T> = (payload: T) => void;

type HandlerMap = Map<string, Set<EventHandler<unknown>>>;

export interface EventBus {
  on<T>(event: string, handler: EventHandler<T>): void;
  off<T>(event: string, handler: EventHandler<T>): void;
  emit<T>(event: string, payload: T): void;
  clear(): void;
}

export class SimpleEventBus implements EventBus {
  private handlers: HandlerMap = new Map();

  on<T>(event: string, handler: EventHandler<T>): void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as EventHandler<unknown>);
    this.handlers.set(event, set);
  }

  off<T>(event: string, handler: EventHandler<T>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(handler as EventHandler<unknown>);
    if (set.size === 0) this.handlers.delete(event);
  }

  emit<T>(event: string, payload: T): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
