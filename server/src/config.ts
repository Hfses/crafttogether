export interface AppConfig {
  port: number;
  relayPort: number;
  publicHost: string;
  sessionTtlSeconds: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): AppConfig {
  return {
    port: intFromEnv("PORT", 8080),
    relayPort: intFromEnv("RELAY_PORT", 19133),
    publicHost: process.env.PUBLIC_HOST ?? "127.0.0.1",
    sessionTtlSeconds: intFromEnv("SESSION_TTL_SECONDS", 180),
  };
}
