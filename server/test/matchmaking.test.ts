import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  isValidRoomCode,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type ListRoomsResponse,
} from "@crafttogether/shared";
import { RoomStore } from "../src/store.js";
import { RelayServer } from "../src/relay.js";
import { SignalingHub } from "../src/signaling.js";
import { buildHttpServer } from "../src/http.js";
import { loadConfig } from "../src/config.js";

describe("matchmaking HTTP API", () => {
  let app: FastifyInstance;
  let relay: RelayServer;

  beforeEach(async () => {
    const config = { ...loadConfig(), relayPort: 0, publicHost: "test.local" };
    const store = new RoomStore(config.sessionTtlSeconds);
    relay = new RelayServer();
    const hub = new SignalingHub(store);
    app = buildHttpServer({ config, store, relay, hub });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await relay.close();
  });

  async function createRoom(overrides: Record<string, unknown> = {}): Promise<CreateRoomResponse> {
    const res = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { name: "Minha Sala", hostName: "Atul", visibility: "public", ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return res.json<CreateRoomResponse>();
  }

  it("creates a room with a valid shareable code", async () => {
    const created = await createRoom();
    expect(isValidRoomCode(created.room.code)).toBe(true);
    expect(created.hostToken).toBeTruthy();
    expect(created.room.guestCount).toBe(0);
  });

  it("lists only public rooms", async () => {
    await createRoom({ visibility: "public", name: "Publica" });
    await createRoom({ visibility: "private", name: "Privada" });
    const res = await app.inject({ method: "GET", url: "/rooms" });
    const body = res.json<ListRoomsResponse>();
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0].name).toBe("Publica");
  });

  it("lets a friend join by code and issues a distinct relay token", async () => {
    const created = await createRoom();
    const res = await app.inject({
      method: "POST",
      url: "/rooms/join",
      payload: { code: created.room.code, guestName: "Amigo" },
    });
    expect(res.statusCode).toBe(200);
    const joined = res.json<JoinRoomResponse>();
    expect(joined.room.guestCount).toBe(1);
    expect(joined.guestToken).toBeTruthy();
    expect(joined.relay.host).toBe("test.local");
    // Guest relay token must differ from the host token.
    expect(joined.relay.token).not.toBe(created.hostToken);
    // The relay must now know about the guest's token.
    expect(relay.hasToken(joined.relay.token)).toBe(true);
  });

  it("rejects an invalid code and a missing room", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/rooms/join",
      payload: { code: "!!", guestName: "x" },
    });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/rooms/join",
      payload: { code: "ABCDEF", guestName: "x" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("enforces the guest limit", async () => {
    const created = await createRoom({ maxGuests: 1 });
    const first = await app.inject({
      method: "POST",
      url: "/rooms/join",
      payload: { code: created.room.code, guestName: "A" },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/rooms/join",
      payload: { code: created.room.code, guestName: "B" },
    });
    expect(second.statusCode).toBe(409);
  });

  it("closes the room when the host leaves", async () => {
    const created = await createRoom();
    const leave = await app.inject({
      method: "POST",
      url: "/rooms/leave",
      payload: { token: created.hostToken },
    });
    expect(leave.statusCode).toBe(200);
    const res = await app.inject({ method: "GET", url: `/rooms/${created.room.id}` });
    expect(res.statusCode).toBe(404);
  });
});
