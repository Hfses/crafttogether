import dgram from "node:dgram";
import { tryParseRelayRegister } from "@crafttogether/shared";

interface PeerState {
  /** The token this peer is paired with; datagrams are forwarded there. */
  peerToken: string;
  /** Last known UDP address of this peer, learned from its registration frame. */
  addr?: { address: string; port: number };
  lastSeen: number;
}

/**
 * A transport-level UDP relay. It knows nothing about Minecraft or RakNet: it
 * forwards opaque datagrams between exactly two paired tokens.
 *
 * Handshake: a proxy first sends a registration frame (see
 * `encodeRelayRegister` in @crafttogether/shared) carrying its token. The relay
 * records the source address for that token. Every later datagram from that
 * address is forwarded verbatim to the paired token's last known address.
 */
export class RelayServer {
  private socket = dgram.createSocket("udp4");
  private peers = new Map<string, PeerState>();
  private started = false;

  onForward?: (fromToken: string, bytes: number) => void;

  registerPair(tokenA: string, tokenB: string): void {
    const now = Date.now();
    this.peers.set(tokenA, { peerToken: tokenB, lastSeen: now });
    this.peers.set(tokenB, { peerToken: tokenA, lastSeen: now });
  }

  unregisterToken(token: string): void {
    const peer = this.peers.get(token);
    this.peers.delete(token);
    if (peer) this.peers.delete(peer.peerToken);
  }

  hasToken(token: string): boolean {
    return this.peers.has(token);
  }

  /** Address a registered token was last seen at (used by tests). */
  addressFor(token: string): { address: string; port: number } | undefined {
    return this.peers.get(token)?.addr;
  }

  start(port: number, host = "0.0.0.0"): Promise<number> {
    return new Promise((resolve, reject) => {
      this.socket.on("error", (err) => {
        if (!this.started) reject(err);
        else console.error("[relay] socket error", err);
      });
      this.socket.on("message", (msg, rinfo) => this.handleMessage(msg, rinfo));
      this.socket.bind(port, host, () => {
        this.started = true;
        const address = this.socket.address();
        const boundPort = typeof address === "object" ? address.port : port;
        console.log(`[relay] listening udp://${host}:${boundPort}`);
        resolve(boundPort);
      });
    });
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const maybeToken = tryParseRelayRegister(new Uint8Array(msg));
    if (maybeToken !== null) {
      const peer = this.peers.get(maybeToken);
      if (!peer) return; // unknown/expired token — ignore
      peer.addr = { address: rinfo.address, port: rinfo.port };
      peer.lastSeen = Date.now();
      return;
    }

    // Data datagram: find which token owns this source address, forward to peer.
    const from = this.tokenForAddress(rinfo.address, rinfo.port);
    if (!from) return; // source hasn't registered yet
    const peer = this.peers.get(from);
    if (!peer) return;
    peer.lastSeen = Date.now();
    const dest = this.peers.get(peer.peerToken);
    if (!dest?.addr) return; // paired peer not connected yet
    this.socket.send(msg, dest.addr.port, dest.addr.address);
    this.onForward?.(from, msg.length);
  }

  private tokenForAddress(address: string, port: number): string | undefined {
    for (const [token, peer] of this.peers) {
      if (peer.addr && peer.addr.address === address && peer.addr.port === port) {
        return token;
      }
    }
    return undefined;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.peers.clear();
      this.socket.close(() => resolve());
    });
  }
}
