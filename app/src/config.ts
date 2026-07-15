import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/**
 * Backend server configuration. The user can point the app at any
 * CraftTogether server from the Settings screen; the value persists on the
 * device. `EXPO_PUBLIC_API_URL` (baked at build time) is only the default.
 */

const KEY_API_URL = "ct.apiUrl";

export const DEFAULT_API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://127.0.0.1:8080";

let cachedUrl: string | null = null;

export function normalizeApiUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

/** Load the configured server URL (cached after first read). */
export async function getApiUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl;
  const stored = await AsyncStorage.getItem(KEY_API_URL);
  cachedUrl = stored && stored.length > 0 ? stored : DEFAULT_API_URL;
  return cachedUrl;
}

/** Persist a new server URL. Pass an empty string to reset to the default. */
export async function setApiUrl(value: string): Promise<string> {
  const normalized = normalizeApiUrl(value);
  if (!normalized) {
    await AsyncStorage.removeItem(KEY_API_URL);
    cachedUrl = DEFAULT_API_URL;
  } else {
    await AsyncStorage.setItem(KEY_API_URL, normalized);
    cachedUrl = normalized;
  }
  return cachedUrl;
}

/** Derive the WebSocket signaling URL from the configured API URL. */
export async function getWsUrl(): Promise<string> {
  const api = await getApiUrl();
  return api.replace(/^http/i, "ws") + "/ws";
}
