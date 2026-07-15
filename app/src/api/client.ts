import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  ListRoomsResponse,
  RoomSummary,
} from "@crafttogether/shared";
import { getApiUrl } from "@/config";

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(`API ${status}: ${code}`);
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getApiUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError(0, e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let code = "unknown_error";
    try {
      const body = await res.json();
      code = body?.error ?? code;
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; rooms?: number }>("/health"),

  createRoom: (body: CreateRoomRequest) =>
    request<CreateRoomResponse>("/rooms", { method: "POST", body: JSON.stringify(body) }),

  listRooms: () => request<ListRoomsResponse>("/rooms"),

  joinRoom: (body: JoinRoomRequest) =>
    request<JoinRoomResponse>("/rooms/join", { method: "POST", body: JSON.stringify(body) }),

  getRoom: (id: string) => request<{ room: RoomSummary }>(`/rooms/${id}`),

  leave: (token: string) =>
    request<{ ok: boolean }>("/rooms/leave", { method: "POST", body: JSON.stringify({ token }) }),
};
