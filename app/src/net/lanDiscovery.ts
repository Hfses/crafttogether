import dgram from "react-native-udp";
import { BEDROCK_DEFAULT_PORT } from "@crafttogether/shared";

/**
 * Discovers Minecraft Bedrock worlds on the same Wi-Fi by sending a RakNet
 * "Unconnected Ping" to the broadcast address and parsing the "Unconnected
 * Pong" replies. This is the standard, documented LAN discovery handshake the
 * game itself uses — we only read the public MOTD string worlds already
 * broadcast.
 */

export interface LanWorld {
  address: string;
  port: number;
  name: string;
  players?: number;
  maxPlayers?: number;
}

// RakNet offline message magic.
const MAGIC = Uint8Array.from([
  0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78,
]);
const ID_UNCONNECTED_PING = 0x01;
const ID_UNCONNECTED_PONG = 0x1c;

function buildUnconnectedPing(): Uint8Array {
  const buf = new Uint8Array(1 + 8 + MAGIC.length + 8);
  const view = new DataView(buf.buffer);
  buf[0] = ID_UNCONNECTED_PING;
  // time (ms) — any monotonic-ish value is fine for discovery
  view.setUint32(1, 0, false);
  view.setUint32(5, (Date.now() >>> 0) & 0xffffffff, false);
  buf.set(MAGIC, 9);
  // client GUID (8 bytes) — arbitrary
  view.setUint32(9 + MAGIC.length, 0x43524146, false); // "CRAF"
  view.setUint32(9 + MAGIC.length + 4, 0x54474852, false); // "TGHR"
  return buf;
}

function parsePong(msg: Uint8Array, address: string): LanWorld | null {
  if (msg.length < 35 || msg[0] !== ID_UNCONNECTED_PONG) return null;
  const view = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
  const strLen = view.getUint16(33, false);
  const strStart = 35;
  if (msg.length < strStart + strLen) return null;
  const id = new TextDecoder().decode(msg.subarray(strStart, strStart + strLen));
  // Format: MCPE;<motd>;<protocol>;<version>;<players>;<max>;<serverId>;<world>;...
  const parts = id.split(";");
  const name = parts[1]?.trim() || parts[7]?.trim() || "Mundo LAN";
  const players = Number.parseInt(parts[4] ?? "", 10);
  const maxPlayers = Number.parseInt(parts[5] ?? "", 10);
  const port = Number.parseInt(parts[10] ?? "", 10) || BEDROCK_DEFAULT_PORT;
  return {
    address,
    port,
    name,
    players: Number.isFinite(players) ? players : undefined,
    maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : undefined,
  };
}

interface BroadcastSocket {
  bind(port: number, address?: string, cb?: () => void): void;
  setBroadcast(flag: boolean): void;
  on(event: "message", cb: (msg: Buffer, rinfo: { address: string; port: number }) => void): void;
  send(msg: Uint8Array, offset: number, length: number, port: number, address: string): void;
  close(cb?: () => void): void;
}

/**
 * Broadcast a ping and collect replies for `timeoutMs`. Returns unique worlds
 * keyed by address:port.
 */
export function discoverLanWorlds(timeoutMs = 1500): Promise<LanWorld[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4" }) as unknown as BroadcastSocket;
    const found = new Map<string, LanWorld>();

    const finish = () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve([...found.values()]);
    };

    socket.on("message", (msg, rinfo) => {
      const world = parsePong(new Uint8Array(msg), rinfo.address);
      if (world) found.set(`${world.address}:${world.port}`, world);
    });

    socket.bind(0, "0.0.0.0", () => {
      try {
        socket.setBroadcast(true);
        const ping = buildUnconnectedPing();
        socket.send(ping, 0, ping.length, BEDROCK_DEFAULT_PORT, "255.255.255.255");
      } catch {
        // some networks block broadcast; just resolve empty
      }
      setTimeout(finish, timeoutMs);
    });
  });
}
