import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort error boundary. Without it, any uncaught render error turns the
 * whole app into a blank/white screen with no explanation.
 */
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Algo deu errado</Text>
          <Text style={styles.errorBody}>
            O aplicativo encontrou um erro inesperado. Toque abaixo para tentar de novo.
          </Text>
          <Text style={styles.errorDetail} numberOfLines={4}>
            {this.state.error.message}
          </Text>
          <Text style={styles.errorButton} onPress={() => this.setState({ error: null })}>
            Tentar novamente
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppErrorBoundary>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "800" },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: "CraftTogether" }} />
          <Stack.Screen name="create" options={{ title: "Criar sala" }} />
          <Stack.Screen name="rooms" options={{ title: "Encontrar salas" }} />
          <Stack.Screen name="room/[id]" options={{ title: "Sala" }} />
          <Stack.Screen name="friends" options={{ title: "Amigos" }} />
          <Stack.Screen name="guide" options={{ title: "Como jogar junto" }} />
          <Stack.Screen name="settings" options={{ title: "Servidor" }} />
        </Stack>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  errorBody: { color: colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 21 },
  errorDetail: { color: colors.danger, fontSize: 12, fontFamily: "monospace" as const },
  errorButton: {
    color: colors.bg,
    backgroundColor: colors.primary,
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    overflow: "hidden",
  },
});
