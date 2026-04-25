type EventHandler = (data: unknown) => void | Promise<void>;

export class PluginEventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  // Tracks which plugin owns which (event, handler) pair so disable/uninstall can clean up
  // — without this, every togglePlugin(false)/uninstall left zombie handlers wired to the
  // singleton, leaking memory and firing stale closures on later events.
  private ownership = new Map<string, Array<{ event: string; handler: EventHandler }>>();

  on(event: string, handler: EventHandler, pluginId?: string): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    if (pluginId) {
      if (!this.ownership.has(pluginId)) this.ownership.set(pluginId, []);
      this.ownership.get(pluginId)!.push({ event, handler });
    }
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
    for (const list of this.ownership.values()) {
      const idx = list.findIndex((e) => e.event === event && e.handler === handler);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  /** Drop every handler registered by the given plugin. Called on disable + uninstall. */
  removeAllForPlugin(pluginId: string): number {
    const owned = this.ownership.get(pluginId);
    if (!owned) return 0;
    let removed = 0;
    for (const { event, handler } of owned) {
      if (this.listeners.get(event)?.delete(handler)) removed++;
    }
    this.ownership.delete(pluginId);
    return removed;
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
