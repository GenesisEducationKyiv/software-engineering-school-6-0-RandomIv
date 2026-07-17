export interface MessagePublisher<T> {
  publish(message: T): Promise<void>;
}
