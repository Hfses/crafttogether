import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  CHAT_MAX_LENGTH,
  type RelayEndpoint,
  type RoomSummary,
  type SignalServerMessage,
} from "@crafttogether/shared";
import { Button, Card, Screen, Subtitle, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";
import { api } from "@/api/client";
import { SignalingClient } from "@/net/signaling";
import { UdpProxy } from "@/net/udpProxy";
import { clearActiveSession, getActiveSession } from "@/state/active";

interface PeerRow {
  name: string;
  role: string;
}

interface ChatRow {
  name: string;
  role: string;
  text: string;
  at: number;
  system?: boolean;
}

const MAX_CHAT_ROWS = 100;

export default function RoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = getActiveSession();

  const [room, setRoom] = useState<RoomSummary | null>(session?.room ?? null);
  const [peers, setPeers] = useState<PeerRow[]>([]);
  const [connState, setConnState] = useState<"idle" | "linking" | "ready">("idle");
  const [chat, setChat] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");

  const signalingRef = useRef<SignalingClient | null>(null);
  const proxiesRef = useRef<UdpProxy[]>([]);
  const chatScrollRef = useRef<ScrollView | null>(null);

  const pushChat = useCallback((row: ChatRow) => {
    setChat((prev) => [...prev.slice(-MAX_CHAT_ROWS + 1), row]);
  }, []);

  const pushSystem = useCallback(
    (text: string) => pushChat({ name: "", role: "system", text, at: Date.now(), system: true }),
    [pushChat],
  );

  const startHostProxy = useCallback(
    (relay: RelayEndpoint) => {
      const proxy = new UdpProxy(relay, { mode: "host" });
      proxy.onStatus = (s) => {
        if (s.running) setConnState("ready");
        if (s.lastError) pushSystem(`Erro de conexão: ${s.lastError}`);
      };
      proxy.start().then(() => pushSystem("Ponte de um amigo conectada ao seu mundo."));
      proxiesRef.current.push(proxy);
      setConnState("linking");
    },
    [pushSystem],
  );

  useEffect(() => {
    if (!session || !id) return;

    // Guest starts its local proxy immediately (host proxies start per guest).
    if (session.role === "guest" && session.relay) {
      const proxy = new UdpProxy(session.relay, { mode: "guest", localPort: session.localPort });
      proxy.onStatus = (s) => {
        if (s.running) setConnState("ready");
        if (s.lastError) pushSystem(`Erro de conexão: ${s.lastError}`);
      };
      proxy.start().then(() => pushSystem("Proxy local pronto. Adicione o servidor no Minecraft."));
      proxiesRef.current.push(proxy);
      setConnState("linking");
    }

    const client = new SignalingClient(id, session.token, session.role);
    signalingRef.current = client;
    client.on((msg: SignalServerMessage) => {
      switch (msg.type) {
        case "welcome":
        case "room-update":
          setRoom(msg.room);
          break;
        case "peer-joined":
          setPeers((p) =>
            p.some((x) => x.name === msg.name) ? p : [...p, { name: msg.name, role: msg.role }],
          );
          pushSystem(`${msg.name} entrou.`);
          break;
        case "peer-left":
          setPeers((p) => p.filter((x) => x.name !== msg.name));
          pushSystem(`${msg.name} saiu.`);
          break;
        case "chat":
          pushChat({ name: msg.name, role: msg.role, text: msg.text, at: msg.at });
          break;
        case "relay-ready":
          // Host receives a dedicated relay endpoint per guest; bridge to the local world.
          if (session.role === "host") startHostProxy(msg.relay);
          break;
        case "host-left":
          Alert.alert("Sala encerrada", "O host saiu da sala.");
          leave();
          break;
        case "error":
          pushSystem(`Erro: ${msg.message}`);
          break;
      }
    });
    client.connect();

    return () => {
      signalingRef.current?.close();
      proxiesRef.current.forEach((p) => p.stop());
      proxiesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    signalingRef.current?.sendChat(text);
    setDraft("");
  };

  const copyCode = async () => {
    if (room) {
      await Clipboard.setStringAsync(room.code);
      Alert.alert("Copiado", `Código ${room.code} copiado.`);
    }
  };

  const leave = async () => {
    signalingRef.current?.close();
    proxiesRef.current.forEach((p) => p.stop());
    proxiesRef.current = [];
    if (session) {
      try {
        await api.leave(session.token);
      } catch {
        // best effort
      }
    }
    clearActiveSession();
    router.replace("/");
  };

  if (!session || !room) {
    return (
      <Screen>
        <Title>Sala</Title>
        <Subtitle>Sessão não encontrada. Volte e entre novamente.</Subtitle>
        <Button label="Voltar" onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  const isHost = session.role === "host";
  const serverAddress = `127.0.0.1:${session.localPort}`;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Title>{room.name}</Title>
            <Text style={styles.meta}>
              {connState === "ready"
                ? "● Ponte ativa"
                : connState === "linking"
                  ? "● Conectando…"
                  : "○ Aguardando"}{" "}
              · {room.guestCount + 1} na sala
            </Text>
          </View>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>CÓDIGO</Text>
            <Text style={styles.code} onPress={copyCode}>
              {room.code}
            </Text>
          </View>
        </View>

        {isHost ? (
          <Card>
            <Text style={styles.label}>Você é o host — faça isto no Minecraft:</Text>
            <Text style={styles.step}>1. Abra o seu mundo.</Text>
            <Text style={styles.step}>
              2. Nas configurações do mundo, ligue "Visível para jogadores da LAN".
            </Text>
            <Text style={styles.step}>3. Compartilhe o código acima com seus amigos.</Text>
          </Card>
        ) : (
          <Card>
            <Text style={styles.label}>Para entrar — faça isto no Minecraft:</Text>
            <Text style={styles.step}>
              1. Aba "Servidores" → "Adicionar servidor" → endereço{" "}
              <Text style={styles.mono}>127.0.0.1</Text>, porta{" "}
              <Text style={styles.mono}>{session.localPort}</Text>.
            </Text>
            <Text style={styles.step}>2. Salve e toque em "Jogar".</Text>
            <Button
              label="Copiar endereço"
              variant="secondary"
              onPress={async () => {
                await Clipboard.setStringAsync(serverAddress);
                Alert.alert("Copiado", `${serverAddress} copiado.`);
              }}
            />
          </Card>
        )}

        <Card>
          <Text style={styles.label}>Jogadores</Text>
          <Text style={styles.peer}>{room.hostName} (host)</Text>
          {peers
            .filter((p) => p.role !== "host")
            .map((p, i) => (
              <Text key={`${p.name}-${i}`} style={styles.peer}>
                {p.name}
              </Text>
            ))}
        </Card>

        <Card style={styles.chatCard}>
          <Text style={styles.label}>Chat da sala</Text>
          <ScrollView
            ref={chatScrollRef}
            style={styles.chatScroll}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
          >
            {chat.length === 0 ? (
              <Text style={styles.chatEmpty}>
                Nenhuma mensagem ainda. Diga oi para os seus amigos!
              </Text>
            ) : (
              chat.map((row, i) =>
                row.system ? (
                  <Text key={i} style={styles.chatSystem}>
                    {row.text}
                  </Text>
                ) : (
                  <Text key={i} style={styles.chatRow}>
                    <Text style={styles.chatName}>{row.name}: </Text>
                    {row.text}
                  </Text>
                ),
              )
            )}
          </ScrollView>
          <View style={styles.chatInputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Mensagem…"
              placeholderTextColor={colors.textMuted}
              style={styles.chatInput}
              maxLength={CHAT_MAX_LENGTH}
              onSubmitEditing={(e) => {
                // @ts-expect-error isComposing exists on native web events; harmless on native
                if (e.nativeEvent?.isComposing) return;
                sendChat();
              }}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <Button label="Enviar" onPress={sendChat} disabled={draft.trim().length === 0} />
          </View>
        </Card>

        <Button label="Sair da sala" variant="danger" onPress={leave} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  codeBox: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  codeLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2 },
  code: { color: colors.accent, fontSize: 22, fontWeight: "900", letterSpacing: 3 },
  label: { color: colors.textMuted, fontSize: 13 },
  step: { color: colors.text, fontSize: 15, lineHeight: 22 },
  mono: { color: colors.accent, fontWeight: "800" },
  peer: { color: colors.text, fontSize: 16 },
  chatCard: { minHeight: 220 },
  chatScroll: { maxHeight: 200, minHeight: 120 },
  chatEmpty: { color: colors.textMuted, fontSize: 13, fontStyle: "italic" },
  chatRow: { color: colors.text, fontSize: 14, lineHeight: 20 },
  chatName: { color: colors.accent, fontWeight: "800" },
  chatSystem: { color: colors.textMuted, fontSize: 12, fontStyle: "italic", lineHeight: 18 },
  chatInputRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  chatInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
  },
});
