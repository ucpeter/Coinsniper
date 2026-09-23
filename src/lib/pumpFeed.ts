"use client";

import type { PumpPortalEvent, PumpPortalNewTokenEvent, PumpPortalTradeEvent } from "./types";

type FeedStatus = "idle" | "connecting" | "open" | "closed" | "error";
type EventListener = (event: PumpPortalEvent) => void;
type StatusListener = (status: FeedStatus) => void;

const WS_URL = "wss://pumpportal.fun/api/data";

/**
 * Singleton manager for the single real-time WebSocket connection to
 * PumpPortal's public Data API (free, no key required). PumpPortal's own
 * docs ask integrators to keep exactly one connection open, so this is a
 * module-level singleton rather than a per-component connection.
 */
class PumpFeedManager {
  private ws: WebSocket | null = null;
  private status: FeedStatus = "idle";
  private listeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private subscribedMints = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantConnected = false;

  connect() {
    this.wantConnected = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus("open");
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
      this.setStatus("closed");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      this.setStatus("error");
    };
  }

  disconnect() {
    this.wantConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.setStatus("idle");
  }

  private scheduleReconnect() {
    if (!this.wantConnected) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantConnected) this.connect();
    }, 2500);
  }

  subscribeTokenTrade(mints: string[]) {
    const fresh = mints.filter((m) => !this.subscribedMints.has(m));
    if (fresh.length === 0) return;
    fresh.forEach((m) => this.subscribedMints.add(m));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: fresh }));
    }
  }

  unsubscribeTokenTrade(mints: string[]) {
    mints.forEach((m) => this.subscribedMints.delete(m));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: "unsubscribeTokenTrade", keys: mints }));
    }
  }

  onEvent(cb: EventListener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onStatus(cb: StatusListener) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  getStatus() {
    return this.status;
  }

  private setStatus(status: FeedStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  private emit(event: PumpPortalEvent) {
    this.listeners.forEach((cb) => cb(event));
  }
}

export const pumpFeed = new PumpFeedManager();
export type { FeedStatus };
