type Listener = (event: string, payload: unknown) => void;

const listeners = new Set<Listener>();

export function emitServerEvent(event: string, payload: unknown): void {
  for (const listener of [...listeners]) {
    listener(event, payload);
  }
}

export function subscribeServerEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
