import { afterEach, describe, expect, it } from "vitest";
import dgram from "node:dgram";
import { encodeRelayRegister } from "@crafttogether/shared";
import { RelayServer } from "../src/relay.js";

/**
 * Proves that opaque datagrams cross the relay end-to-end in both directions,
 * simulating the host-side and guest-side on-device proxies. No Minecraft
 * needed: two UDP sockets stand in for the two proxies.
 */

function once(socket: dgram.Socket, event: "message"): Promise<Buffer> {
  return new Promise((resolve) => socket.once(event, (msg: Buffer) => resolve(msg)));
}

function bind(socket: dgram.Socket): Promise<void> {
  return new Promise((resolve) => socket.bind(0, "127.0.0.1", () => resolve()));
}

describe("RelayServer", () => {
  let relay: RelayServer;
  const sockets: dgram.Socket[] = [];

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.close();
    if (relay) await relay.close();
  });

  it("forwards datagrams between two paired peers in both directions", async () => {
    relay = new RelayServer();
    const relayPort = await relay.start(0, "127.0.0.1");

    const guestToken = "guest-token-abc";
    const hostToken = "host-token-xyz";
    relay.registerPair(guestToken, hostToken);

    const guest = dgram.createSocket("udp4");
    const host = dgram.createSocket("udp4");
    sockets.push(guest, host);
    await bind(guest);
    await bind(host);

    // Both proxies register with the relay.
    guest.send(Buffer.from(encodeRelayRegister(guestToken)), relayPort, "127.0.0.1");
    host.send(Buffer.from(encodeRelayRegister(hostToken)), relayPort, "127.0.0.1");

    // Give the relay a tick to record both source addresses.
    await new Promise((r) => setTimeout(r, 50));
    expect(relay.addressFor(guestToken)).toBeDefined();
    expect(relay.addressFor(hostToken)).toBeDefined();

    // Guest -> Host (as if Minecraft on the guest sent a RakNet packet).
    const hostRecv = once(host, "message");
    guest.send(Buffer.from("HELLO_FROM_GUEST"), relayPort, "127.0.0.1");
    expect((await hostRecv).toString()).toBe("HELLO_FROM_GUEST");

    // Host -> Guest (the world's reply).
    const guestRecv = once(guest, "message");
    host.send(Buffer.from("WELCOME_FROM_HOST"), relayPort, "127.0.0.1");
    expect((await guestRecv).toString()).toBe("WELCOME_FROM_HOST");
  });

  it("drops datagrams from unregistered sources", async () => {
    relay = new RelayServer();
    const relayPort = await relay.start(0, "127.0.0.1");

    const stranger = dgram.createSocket("udp4");
    sockets.push(stranger);
    await bind(stranger);

    let forwarded = false;
    relay.onForward = () => {
      forwarded = true;
    };
    stranger.send(Buffer.from("noise"), relayPort, "127.0.0.1");
    await new Promise((r) => setTimeout(r, 50));
    expect(forwarded).toBe(false);
  });

  it("stops forwarding after a token is unregistered", async () => {
    relay = new RelayServer();
    const relayPort = await relay.start(0, "127.0.0.1");
    relay.registerPair("a", "b");

    const peerA = dgram.createSocket("udp4");
    const peerB = dgram.createSocket("udp4");
    sockets.push(peerA, peerB);
    await bind(peerA);
    await bind(peerB);

    peerA.send(Buffer.from(encodeRelayRegister("a")), relayPort, "127.0.0.1");
    peerB.send(Buffer.from(encodeRelayRegister("b")), relayPort, "127.0.0.1");
    await new Promise((r) => setTimeout(r, 50));

    relay.unregisterToken("a");

    let forwarded = false;
    relay.onForward = () => {
      forwarded = true;
    };
    peerA.send(Buffer.from("after-unregister"), relayPort, "127.0.0.1");
    await new Promise((r) => setTimeout(r, 50));
    expect(forwarded).toBe(false);
  });
});
