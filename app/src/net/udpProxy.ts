import dgram from "react-native-udp";
import {
  BEDROCK_DEFAULT_PORT,
  encodeRelayRegister,
  type RelayEndpoint,
} from "@crafttogether/shared";

/**
 * On-device UDP bridge between the local Minecraft game and the cloud relay.
 * It forwards opaque RakNet datagrams verbatim — it never inspects or changes
 * game content.
 *
 * Two modes:
 *  - "guest": binds a local port. The player adds `127.0.0.1:<localPort>` in the
 *    Minecraft "Servers" tab; packets from the game are tunneled to the relay,
 *    and the host's replies are delivered back to the game.
 *  - "host": connects to the host's own LAN world (127.0.0.1:19132). Packets
 *    arriving from the relay (sent by a guest) are delivered to the game, and
 *    the world's replies are tunneled back.
 */

export type ProxyMode =
  | { mode: "guest"; localPort: number }
  | { mode: "host"; gameHost?: string; gamePort?: number };

export interface ProxyStatus {
  running: boolean;
  bytesUp: number;
  bytesDown: number;
  lastError?: string;
}

// Minimal shape of a react-native-udp socket (avoids over-coupling to versions).
interface UdpSocket {
  bind(port: number, address?: string, callback?: () => void): void;
  on(event: "message", cb: (msg: Buffer, rinfo: { address: string; port: number }) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  send(
    msg: Uint8Array | string,
    offset: number,
    length: number,
    port: number,
    address: string,
    callback?: (err?: Error) => void,
  ): void;
  close(cb?: () => void): void;
}

const KEEPALIVE_MS = 15_000;

export class UdpProxy {
  private relaySocket: UdpSocket | null = null;
  private localSocket: UdpSocket | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private lastGameAddr: { address: string; port: number } | null = null;
  private status: ProxyStatus = { running: false, bytesUp: 0, bytesDown: 0 };

  onStatus?: (status: ProxyStatus) => void;

  constructor(
    private readonly relay: RelayEndpoint,
    private readonly config: ProxyMode,
  ) {}

  private emit(): void {
    this.onStatus?.({ ...this.status });
  }

  private send(sock: UdpSocket, data: Uint8Array, port: number, address: string): void {
    sock.send(data, 0, data.length, port, address, (err) => {
      if (err) {
        this.status.lastError = err.message;
        this.emit();
      }
    });
  }

  async start(): Promise<void> {
    const relaySocket = dgram.createSocket({ type: "udp4" }) as unknown as UdpSocket;
    this.relaySocket = relaySocket;

    relaySocket.on("error", (err) => {
      this.status.lastError = err.message;
      this.emit();
    });

    // Relay -> local game
    relaySocket.on("message", (msg) => {
      this.status.bytesDown += msg.length;
      this.deliverToGame(msg);
      this.emit();
    });

    await new Promise<void>((resolve) => relaySocket.bind(0, "0.0.0.0", () => resolve()));

    // Register with the relay and keep the mapping warm.
    this.registerWithRelay();
    this.keepalive = setInterval(() => this.registerWithRelay(), KEEPALIVE_MS);

    if (this.config.mode === "guest") {
      await this.startGuestListener(this.config.localPort);
    } else {
      // Host mode: prepare a socket to talk to the local Minecraft LAN world.
      const gameSocket = dgram.createSocket({ type: "udp4" }) as unknown as UdpSocket;
      this.localSocket = gameSocket;
      this.lastGameAddr = {
        address: this.config.gameHost ?? "127.0.0.1",
        port: this.config.gamePort ?? BEDROCK_DEFAULT_PORT,
      };
      gameSocket.on("error", (err) => {
        this.status.lastError = err.message;
        this.emit();
      });
      gameSocket.on("message", (msg) => {
        // Reply from the host's world -> tunnel to the relay -> guest.
        this.status.bytesUp += msg.length;
        this.tunnelToRelay(msg);
        this.emit();
      });
      await new Promise<void>((resolve) => gameSocket.bind(0, "0.0.0.0", () => resolve()));
    }

    this.status.running = true;
    this.emit();
  }

  private async startGuestListener(localPort: number): Promise<void> {
    const localSocket = dgram.createSocket({ type: "udp4" }) as unknown as UdpSocket;
    this.localSocket = localSocket;
    localSocket.on("error", (err) => {
      this.status.lastError = err.message;
      this.emit();
    });
    localSocket.on("message", (msg, rinfo) => {
      // Packet from the guest's Minecraft -> tunnel to relay -> host.
      this.lastGameAddr = { address: rinfo.address, port: rinfo.port };
      this.status.bytesUp += msg.length;
      this.tunnelToRelay(msg);
      this.emit();
    });
    await new Promise<void>((resolve) => localSocket.bind(localPort, "127.0.0.1", () => resolve()));
  }

  private registerWithRelay(): void {
    if (!this.relaySocket) return;
    const frame = encodeRelayRegister(this.relay.token);
    this.send(this.relaySocket, frame, this.relay.port, this.relay.host);
  }

  private tunnelToRelay(msg: Uint8Array): void {
    if (!this.relaySocket) return;
    this.send(this.relaySocket, msg, this.relay.port, this.relay.host);
  }

  private deliverToGame(msg: Uint8Array): void {
    if (!this.localSocket || !this.lastGameAddr) return;
    this.send(this.localSocket, msg, this.lastGameAddr.port, this.lastGameAddr.address);
  }

  getStatus(): ProxyStatus {
    return { ...this.status };
  }

  stop(): void {
    if (this.keepalive) {
      clearInterval(this.keepalive);
      this.keepalive = null;
    }
    this.relaySocket?.close();
    this.localSocket?.close();
    this.relaySocket = null;
    this.localSocket = null;
    this.status = { running: false, bytesUp: 0, bytesDown: 0 };
    this.emit();
  }
}
