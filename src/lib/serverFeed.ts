import type { PumpPortalEvent, PumpPortalNewTokenEvent, PumpPortalTradeEvent } from "./types";

type FeedStatus = "idle" | "connecting" | "open" | "closed" | "error";
type EventListener = (event: PumpPortalEvent) => void;

const WS_URL = "wss://pumpportal.fun/api/data";

// Server-side counterpart to pumpFeed.ts (which is browser-only, "use
// client"). Persistent bots need the same live feed but running inside the
// Node process itself, independent of any browser tab. Node 22+ has a
// native WebSocket global, so no extra dependency is needed. Kept as a
// module-level singleton on globalThis so it survives across requests
// within the same server process (same pattern as getServerConnection in
// solanaServer.ts) and isn't duplicated if multiple wallets are running
// persistently at once.
class ServerFeedManager {
  private ws: WebSocket | null = null;
  private status: FeedStatus = "idle";
  private listeners = new Set<EventListener>();
  private subscribedMints = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantConnected = false;

  connect() {
    this.wantConnected = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.status = "connecting";
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      this.status = "open";
      ws.send(JSON.stringify({ method: "subscribeNewToken" }));
      if (this.subscribedMints.size > 0) {
        ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [...this.subscribedMints] }));
      }
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        if (data && (data.txType === "create" || data.txType === "buy" || data.txType === "sell")) {
          this.emit(data as PumpPortalNewTokenEvent | PumpPortalTradeEvent);
        }
      } catch {
        // ignore malformed frames (e.g. subscription ack messages)
      }
    };

    ws.onclose = () => {
      this.status = "closed";
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      this.status = "error";
    };
  }

  private scheduleReconnect() {
    if (!this.wantConnected || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantConnected) this.connect();
    }, 3000);
  }

  disconnectIfIdle() {
    // Only actually tears down the socket once nothing needs it; call this
    // after stopping a persistent bot, not unconditionally, since other
    // persistent bots may still be relying on the same connection.
    if (this.listeners.size === 0) {
      this.wantConnected = false;
      this.ws?.close();
      this.ws = null;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  subscribeTokenTrade(mints: string[]) {
    const fresh = mints.filter((m) => !this.subscribedMints.has(m));
    fresh.forEach((m) => this.subscribedMints.add(m));
    if (fresh.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: fresh }));
    }
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: PumpPortalEvent) {
    this.listeners.forEach((l) => l(event));
  }
}

const globalForFeed = globalThis as typeof globalThis & {
  __serverFeed?: ServerFeedManager;
};

export function getServerFeed(): ServerFeedManager {
  if (!globalForFeed.__serverFeed) {
    globalForFeed.__serverFeed = new ServerFeedManager();
  }
  return globalForFeed.__serverFeed;
}
