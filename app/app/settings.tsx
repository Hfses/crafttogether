import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Screen, Subtitle, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";
import { DEFAULT_API_URL, getApiUrl, normalizeApiUrl, setApiUrl } from "@/config";
import { api } from "@/api/client";

type TestState = "idle" | "testing" | "ok" | "fail";

export default function Settings() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState("");
  const [test, setTest] = useState<TestState>("idle");
  const [rooms, setRooms] = useState<number | null>(null);

  useEffect(() => {
    getApiUrl().then((u) => {
      setUrl(u);
      setSaved(u);
    });
  }, []);

  const save = async () => {
    const applied = await setApiUrl(url);
    setUrl(applied);
    setSaved(applied);
    setTest("idle");
    setRooms(null);
  };

  const reset = async () => {
    const applied = await setApiUrl("");
    setUrl(applied);
    setSaved(applied);
    setTest("idle");
    setRooms(null);
  };

  const runTest = async () => {
    setTest("testing");
    setRooms(null);
    try {
      const res = await api.health();
      setTest(res.ok ? "ok" : "fail");
      setRooms(typeof res.rooms === "number" ? res.rooms : null);
    } catch {
      setTest("fail");
    }
  };

  const dirty = normalizeApiUrl(url) !== saved;

  return (
    <Screen>
      <Title>Servidor</Title>
      <Subtitle>
        Endereço do servidor CraftTogether que cuida das salas, do chat e da ponte entre
        os jogadores. Todos os amigos precisam usar o mesmo servidor.
      </Subtitle>

      <Card>
        <Text style={styles.label}>Endereço do servidor</Text>
        <TextInput
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setTest("idle");
          }}
          placeholder="Ex: https://meu-servidor.fly.dev"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Salvar" onPress={save} disabled={!dirty} />
          </View>
          <View style={styles.flex}>
            <Button label="Testar conexão" variant="secondary" onPress={runTest} loading={test === "testing"} />
          </View>
        </View>
        {test === "ok" && (
          <Text style={styles.ok}>
            Conectado!{rooms !== null ? ` ${rooms} sala(s) pública(s) no momento.` : ""}
          </Text>
        )}
        {test === "fail" && (
          <Text style={styles.fail}>
            Não foi possível conectar. Verifique o endereço e se o servidor está no ar.
          </Text>
        )}
      </Card>

      <Card>
        <Text style={styles.label}>Padrão do app</Text>
        <Text style={styles.mono}>{DEFAULT_API_URL}</Text>
        <Button label="Restaurar padrão" variant="secondary" onPress={reset} />
      </Card>

      <Card>
        <Text style={styles.label}>Não tem um servidor?</Text>
        <Text style={styles.hint}>
          O servidor do CraftTogether é gratuito e de código aberto. O guia de deploy no
          repositório mostra como subir o seu em minutos (Fly.io, Render ou qualquer VPS)
          e compartilhar o endereço com os amigos.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: 13 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  ok: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  fail: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  mono: { color: colors.accent, fontSize: 14, fontFamily: "monospace" as const },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
