import type {
  PeerRole,
  SignalClientMessage,
  SignalServerMessage,
} from "@crafttogether/shared";
import { getWsUrl } from "@/config";

type Listener = (msg: SignalServerMessage) => void;

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 15000;

/**
 * Thin WebSocket client for the signaling channel. It carries room state,
 * chat messages, and relay-ready notifications — never game traffic.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private attempts = 0;

  constructor(
    private readonly roomId: string,
    private readonly token: string,
    private readonly role: PeerRole,
  ) {}

  connect(): void {
    this.closedByUser = false;
    getWsUrl().then((url) => {
      if (this.closedByUser) return;
      this.open(url);
    });
  }

  private open(url: string): void {
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.send({ type: "hello", token: this.token, role: this.role, roomId: this.roomId });
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), 20_000);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as SignalServerMessage;
        this.listeners.forEach((l) => l(msg));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      this.clearPing();
      if (!this.closedByUser) {
        // Exponential backoff capped at RECONNECT_MAX_MS.
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempts, RECONNECT_MAX_MS);
        this.attempts += 1;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };
    ws.onerror = () => ws.close();
  }

  /** Send a chat message to everyone in the room. */
  sendChat(text: string): void {
    const trimmed = text.trim();
    if (trimmed) this.send({ type: "chat", text: trimmed });
  }

  private send(msg: SignalClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  close(): void {
    this.closedByUser = true;
    this.clearPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.send({ type: "leave" });
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}
