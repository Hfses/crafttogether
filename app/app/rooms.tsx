import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { isValidRoomCode, normalizeRoomCode, type RoomSummary } from "@crafttogether/shared";
import { Button, Card, Screen, Subtitle, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";
import { api, ApiError } from "@/api/client";
import { getPlayerName } from "@/state/session";
import { setActiveSession } from "@/state/active";
import { discoverLanWorlds, type LanWorld } from "@/net/lanDiscovery";

const GUEST_LOCAL_PORT = 19140;

export default function Rooms() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [lan, setLan] = useState<LanWorld[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listRooms();
      setRooms(list.rooms);
    } catch (e) {
      const offline = e instanceof ApiError && e.status === 0;
      setError(
        offline
          ? "Servidor fora do ar ou não configurado. Toque em \"Servidor\" na tela inicial para configurar."
          : "Não foi possível carregar as salas.",
      );
    } finally {
      setLoading(false);
    }
    // LAN scan runs independently and may be empty on many networks.
    try {
      setLan(await discoverLanWorlds());
    } catch {
      setLan([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const join = async (joinCode: string) => {
    const normalized = normalizeRoomCode(joinCode);
    if (!isValidRoomCode(normalized)) {
      setError("Código inválido. São 6 caracteres.");
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const guestName = (await getPlayerName()) || "Amigo";
      const res = await api.joinRoom({ code: normalized, guestName });
      setActiveSession({
        role: "guest",
        room: res.room,
        token: res.guestToken,
        relay: res.relay,
        localPort: GUEST_LOCAL_PORT,
      });
      router.replace(`/room/${res.room.id}`);
    } catch (e) {
      const code =
        e instanceof ApiError
          ? e.code === "room_not_found"
            ? "Sala não encontrada."
            : e.code === "room_full"
              ? "A sala está cheia."
              : "Não foi possível entrar."
          : "Não foi possível entrar.";
      setError(code);
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen>
      <Title>Encontrar salas</Title>

      <Card>
        <Text style={styles.label}>Entrar por código</Text>
        <View style={styles.row}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="Ex: K7Q2MP"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={6}
            style={[styles.input, { flex: 1 }]}
          />
          <Button label="Entrar" onPress={() => join(code)} loading={joining} />
        </View>
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.header}>
        <Subtitle>Salas públicas</Subtitle>
        <Text style={styles.refresh} onPress={refresh}>
          Atualizar
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : rooms.length === 0 ? (
        <Text style={styles.empty}>Nenhuma sala pública no momento. Crie a sua!</Text>
      ) : (
        rooms.map((room) => (
          <Card key={room.id}>
            <Text style={styles.roomName}>{room.name}</Text>
            <Text style={styles.meta}>
              Host: {room.hostName} · {room.guestCount}/{room.maxGuests} jogadores
            </Text>
            <Button label={`Entrar (${room.code})`} onPress={() => join(room.code)} />
          </Card>
        ))
      )}

      {lan.length > 0 && (
        <>
          <Subtitle>Na sua Wi-Fi (LAN)</Subtitle>
          {lan.map((w) => (
            <Card key={`${w.address}:${w.port}`}>
              <Text style={styles.roomName}>{w.name}</Text>
              <Text style={styles.meta}>
                {w.address}:{w.port}
                {w.players != null ? ` · ${w.players}/${w.maxPlayers ?? "?"}` : ""}
              </Text>
              <Text style={styles.hint}>
                Na mesma Wi-Fi você já pode abrir o Minecraft e este mundo aparece na
                aba Amigos — sem precisar do relay.
              </Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refresh: { color: colors.accent, fontWeight: "600" },
  empty: { color: colors.textMuted, fontStyle: "italic" },
  roomName: { color: colors.text, fontSize: 18, fontWeight: "700" },
  meta: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14 },
});
