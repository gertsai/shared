export class SimpleEventBus {
    handlers = new Map();
    on(event, handler) {
        const set = this.handlers.get(event) ?? new Set();
        set.add(handler);
        this.handlers.set(event, set);
    }
    off(event, handler) {
        const set = this.handlers.get(event);
        if (!set)
            return;
        set.delete(handler);
        if (set.size === 0)
            this.handlers.delete(event);
    }
    emit(event, payload) {
        const set = this.handlers.get(event);
        if (!set)
            return;
        for (const handler of set) {
            handler(payload);
        }
    }
    clear() {
        this.handlers.clear();
    }
}
