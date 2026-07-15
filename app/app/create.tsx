import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Screen, Subtitle, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";
import { api, ApiError } from "@/api/client";
import { getPlayerName } from "@/state/session";
import { setActiveSession } from "@/state/active";

const GUEST_LOCAL_PORT = 19140;

export default function CreateRoom() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("Sala do Minecraft");
  const [hostName, setHostName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlayerName().then((n) => setHostName(n || "Host"));
  }, []);

  const onCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.createRoom({
        name: roomName,
        hostName,
        visibility: isPublic ? "public" : "private",
      });
      setActiveSession({
        role: "host",
        room: res.room,
        token: res.hostToken,
        localPort: GUEST_LOCAL_PORT,
      });
      router.replace(`/room/${res.room.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Falha ao criar a sala");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>Criar sala</Title>
      <Subtitle>
        Você será o host. Depois de criar, abra o seu mundo no Minecraft com
        "Visível para jogadores da LAN" e compartilhe o código da sala.
      </Subtitle>

      <Card>
        <Text style={styles.label}>Nome da sala</Text>
        <TextInput
          value={roomName}
          onChangeText={setRoomName}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          maxLength={32}
        />
        <Text style={styles.label}>Seu nome</Text>
        <TextInput
          value={hostName}
          onChangeText={setHostName}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          maxLength={32}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Sala pública</Text>
            <Text style={styles.hint}>
              {isPublic ? "Aparece na lista de salas." : "Só quem tem o código entra."}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ true: colors.primaryDark, false: colors.cardBorder }}
            thumbColor={isPublic ? colors.primary : colors.textMuted}
          />
        </View>
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Criar sala" onPress={onCreate} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12 },
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: 14 },
});
