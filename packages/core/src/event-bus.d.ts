export type EventHandler<T> = (payload: T) => void;
export interface EventBus {
    on<T>(event: string, handler: EventHandler<T>): void;
    off<T>(event: string, handler: EventHandler<T>): void;
    emit<T>(event: string, payload: T): void;
    clear(): void;
}
export declare class SimpleEventBus implements EventBus {
    private handlers;
    on<T>(event: string, handler: EventHandler<T>): void;
    off<T>(event: string, handler: EventHandler<T>): void;
    emit<T>(event: string, payload: T): void;
    clear(): void;
}
