type EventHandler = (data: unknown) => void | Promise<void>;

export class PluginEventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  async emit(event: string, data: unknown): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (err) {
        console.error(`[EventBus] Handler error for "${event}":`, err);
      }
    }
  }

  listEvents(): string[] {
    return Array.from(this.listeners.keys());
  }
}

// Singleton — shared across all plugins and the core app
export const pluginEventBus = new PluginEventBus();
