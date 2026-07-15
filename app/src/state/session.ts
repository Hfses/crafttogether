import AsyncStorage from "@react-native-async-storage/async-storage";
import { roomCodeFromBytes } from "@crafttogether/shared";

/**
 * Local, on-device identity. No account/login in the MVP: the player picks a
 * display name and gets a stable friend code so friends can find them.
 */

const KEY_NAME = "ct.playerName";
const KEY_FRIEND_CODE = "ct.friendCode";

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export async function getPlayerName(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_NAME)) ?? "";
}

export async function setPlayerName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEY_NAME, name.trim().slice(0, 32));
}

export async function getFriendCode(): Promise<string> {
  let code = await AsyncStorage.getItem(KEY_FRIEND_CODE);
  if (!code) {
    code = roomCodeFromBytes(randomBytes(8), 8);
    await AsyncStorage.setItem(KEY_FRIEND_CODE, code);
  }
  return code;
}
