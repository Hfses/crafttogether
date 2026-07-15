import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Card, Screen, Subtitle, Title } from "@/components/ui";
import { colors, spacing } from "@/theme";
import { getFriendCode, getPlayerName } from "@/state/session";

export default function Friends() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    getFriendCode().then(setCode);
    getPlayerName().then(setName);
  }, []);

  const share = async () => {
    await Clipboard.setStringAsync(code);
    Alert.alert("Copiado", "Seu código de amigo foi copiado. Envie para quem quiser jogar.");
  };

  return (
    <Screen>
      <Title>Amigos</Title>
      <Subtitle>
        No MVP, jogar com amigos é simples: quem hospeda cria uma sala e passa o
        código; os outros entram por ele. Seu código de amigo abaixo serve como
        sua identidade fixa.
      </Subtitle>

      <Card>
        <Text style={styles.label}>Você</Text>
        <Text style={styles.name}>{name || "(defina seu nome na tela inicial)"}</Text>
        <Text style={styles.label}>Seu código de amigo</Text>
        <Text style={styles.code}>{code}</Text>
        <Button label="Compartilhar meu código" variant="secondary" onPress={share} />
      </Card>

      <Card>
        <Text style={styles.label}>Como jogar com um amigo agora</Text>
        <Text style={styles.step}>1. Um de vocês cria uma sala (vira host).</Text>
        <Text style={styles.step}>2. O host manda o código da sala pelo WhatsApp/Discord.</Text>
        <Text style={styles.step}>3. O amigo abre "Encontrar salas" e entra pelo código.</Text>
        <Text style={styles.step}>4. Sigam o passo a passo dentro da sala. Pronto!</Text>
      </Card>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Lista de amigos persistente e presença online estão no roadmap (precisa de
          contas). Veja o README.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  name: { color: colors.text, fontSize: 20, fontWeight: "700" },
  code: { color: colors.accent, fontSize: 28, fontWeight: "900", letterSpacing: 4 },
  step: { color: colors.text, fontSize: 15, lineHeight: 22 },
  note: { marginTop: spacing.sm },
  noteText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
