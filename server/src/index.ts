import { loadConfig } from "./config.js";
import { RoomStore } from "./store.js";
import { RelayServer } from "./relay.js";
import { SignalingHub } from "./signaling.js";
import { buildHttpServer } from "./http.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new RoomStore(config.sessionTtlSeconds);
  const relay = new RelayServer();
  const hub = new SignalingHub(store);

  await relay.start(config.relayPort);

  const app = buildHttpServer({ config, store, relay, hub });
  await app.listen({ port: config.port, host: "0.0.0.0" });
  hub.attach(app.server);

  console.log(`[http] listening on http://0.0.0.0:${config.port}`);
  console.log(`[ws]   signaling on ws://0.0.0.0:${config.port}/ws`);
  console.log(`[relay] public endpoint ${config.publicHost}:${config.relayPort}`);

  // Garbage-collect idle rooms.
  const sweepTimer = setInterval(() => {
    const closed = store.sweepExpired();
    for (const room of closed) {
      hub.notifyHostLeft(room);
    }
  }, 30_000);
  sweepTimer.unref();

  const shutdown = async () => {
    clearInterval(sweepTimer);
    hub.close();
    await relay.close();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
