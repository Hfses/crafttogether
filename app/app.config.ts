import type { ExpoConfig } from "expo/config";

/**
 * Expo app config. `react-native-udp` requires native code, so this app runs in
 * a Dev Client or a full build (not Expo Go). Run `expo prebuild` then
 * `expo run:android` / `expo run:ios`, or build with EAS.
 */
const config: ExpoConfig = {
  name: "CraftTogether",
  slug: "crafttogether",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "crafttogether",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    resizeMode: "contain",
    backgroundColor: "#0e1a12",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.crafttogether.app",
    infoPlist: {
      // Allow the on-device proxy to talk to the local Minecraft world.
      NSLocalNetworkUsageDescription:
        "O CraftTogether usa a rede local para descobrir e conectar mundos do Minecraft entre amigos.",
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: {
    package: "com.crafttogether.app",
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE"],
  },
  plugins: [
    "expo-router",
    [
      "expo-build-properties",
      {
        android: {
          // Compose Compiler 1.5.15 (pulled in by expo-modules-core) requires
          // Kotlin 1.9.25; RN 0.76 templates default to 1.9.24.
          kotlinVersion: "1.9.25",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8080",
  },
};

export default config;
