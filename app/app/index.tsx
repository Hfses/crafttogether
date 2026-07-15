import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Button, Card, Screen, Subtitle, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";
import { getPlayerName, setPlayerName } from "@/state/session";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    getPlayerName().then(setName);
  }, []);

  const persistName = (value: string) => {
    setName(value);
    setPlayerName(value);
  };

  return (
    <Screen>
      <Title>CraftTogether</Title>
      <Subtitle>
        Encontre salas e jogue o seu Minecraft (Bedrock) com amigos, mesmo em redes
        diferentes. Cada um usa o próprio jogo — o app só cuida da conexão.
      </Subtitle>

      <Card>
        <Text style={styles.label}>Seu nome no jogo</Text>
        <TextInput
          value={name}
          onChangeText={persistName}
          placeholder="Ex: Atul"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          maxLength={32}
        />
      </Card>

      <Button label="Criar uma sala" onPress={() => router.push("/create")} />
      <Button
        label="Encontrar salas"
        variant="secondary"
        onPress={() => router.push("/rooms")}
      />
      <Button label="Amigos" variant="secondary" onPress={() => router.push("/friends")} />
      <Button
        label="Servidor"
        variant="secondary"
        onPress={() => router.push("/settings")}
      />

      <Link href="/guide" style={styles.guideLink}>
        <Text style={styles.guideText}>Como funciona? Ver o guia passo a passo →</Text>
      </Link>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          App não-oficial. Não afiliado à Mojang/Microsoft. Use o seu Minecraft
          legalmente adquirido.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 13 },
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
  guideLink: { paddingVertical: spacing.sm, alignItems: "center" },
  guideText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  disclaimer: { marginTop: spacing.md },
  disclaimerText: { color: colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 17 },
});
