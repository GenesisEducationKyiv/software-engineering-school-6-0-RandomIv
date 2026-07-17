export interface MessageHandler<T> {
  handle(message: T): Promise<void>;
  onFailureExhausted?(message: T, error: unknown): Promise<void>;
}
