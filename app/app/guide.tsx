import { StyleSheet, Text } from "react-native";
import { Card, Screen, Subtitle, Title } from "@/components/ui";
import { colors, spacing } from "@/theme";

export default function Guide() {
  return (
    <Screen>
      <Title>Como jogar junto</Title>
      <Subtitle>
        O CraftTogether não é o jogo — ele conecta os seus Minecraft (Bedrock). Cada
        um precisa ter o Minecraft instalado. O app só cria a ponte de rede.
      </Subtitle>

      <Card>
        <Text style={styles.h}>1. Host (quem abre o mundo)</Text>
        <Text style={styles.p}>• Abra o app e toque em "Criar uma sala".</Text>
        <Text style={styles.p}>• Abra o Minecraft e entre no seu mundo.</Text>
        <Text style={styles.p}>
          • No menu do mundo (Configurações → Multijogador), ligue "Visível para
          jogadores da LAN".
        </Text>
        <Text style={styles.p}>• Volte ao app e compartilhe o código da sala.</Text>
      </Card>

      <Card>
        <Text style={styles.h}>2. Amigo (quem entra)</Text>
        <Text style={styles.p}>• No app, toque em "Encontrar salas".</Text>
        <Text style={styles.p}>• Digite o código que o host enviou e toque em "Entrar".</Text>
        <Text style={styles.p}>
          • A tela da sala mostra um endereço e uma porta (ex.: 127.0.0.1 : 19140).
        </Text>
        <Text style={styles.p}>
          • No Minecraft, aba "Servidores" → "Adicionar servidor" → cole o endereço e
          a porta → "Jogar".
        </Text>
      </Card>

      <Card>
        <Text style={styles.h}>Mesma Wi-Fi? Ainda mais fácil</Text>
        <Text style={styles.p}>
          Se vocês estão na mesma rede, o mundo do host aparece direto na aba "Amigos"
          do Minecraft (descoberta LAN nativa). O relay só é necessário quando vocês
          estão em redes/internets diferentes.
        </Text>
      </Card>

      <Card>
        <Text style={styles.h}>Não conectou? Cheque isto</Text>
        <Text style={styles.p}>• O host abriu o mundo e ligou a opção de LAN?</Text>
        <Text style={styles.p}>• Os dois estão com o app aberto na tela da sala?</Text>
        <Text style={styles.p}>• O endereço/porta foram digitados exatamente como o app mostra?</Text>
        <Text style={styles.p}>• Firewall/rede corporativa pode bloquear UDP — teste em outra rede.</Text>
      </Card>

      <Card>
        <Text style={styles.h}>Aviso</Text>
        <Text style={styles.p}>
          App não-oficial, sem vínculo com a Mojang/Microsoft. Ele não inclui nem
          modifica arquivos do jogo — usa só recursos que o Minecraft já oferece
          (LAN e "Adicionar servidor").
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: spacing.xs },
  p: { color: colors.text, fontSize: 15, lineHeight: 23 },
});
