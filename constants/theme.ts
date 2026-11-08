import { useColorScheme } from "react-native";

const light = {
  background: "#f8f9fa",
  surface: "#ffffff",
  surfaceMuted: "#f4f5f8",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  primary: "#1673C4", // Telegram-style blue, dark enough for white text
  primarySoft: "#e3f0fb",
  onPrimary: "#ffffff",
  success: "#16a34a",
  successSoft: "#dcfce7",
};

const dark: typeof light = {
  background: "#121212",
  surface: "#1c1c1e",
  surfaceMuted: "#121212",
  border: "#27272a",
  text: "#f4f4f5",
  textMuted: "#a1a1aa",
  primary: "#2B8AE0",
  primarySoft: "#14304a",
  onPrimary: "#ffffff",
  success: "#22c55e",
  successSoft: "#14321f",
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
