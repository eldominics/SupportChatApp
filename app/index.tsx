import { Palette, usePalette } from "../constants/theme";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePushNotifications } from "../hook/usePushNotifications";
import { useUnreadNotifications } from "../hook/useUnreadNotifications";
import { signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useAuth } from "../providers/AuthProvider";
import type { UserProfile } from "../types/database";

const STEPS = [
  {
    icon: "chatbubble-ellipses" as const,
    title: "Ask anything",
    text: "Send a message from the app, any time.",
  },
  {
    icon: "flash" as const,
    title: "Instant answers",
    text: "Common questions are answered right away.",
  },
  {
    icon: "paper-plane" as const,
    title: "Real people",
    text: "Our team replies from Telegram, straight to your phone.",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = makeStyles(palette);
  const { session } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const unreadCount = useUnreadNotifications(userId);
  usePushNotifications(userId);

  // The profile row created by the sign-up trigger
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [userId]);

  const firstName = profile?.full_name.split(" ")[0] || "there";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Hi, {firstName}</Text>
            <Text style={styles.title}>Telegram Support</Text>
          </View>

          {/* NEW (Step 12): notification bell with unread badge */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push("/notifications")}
            accessibilityLabel="Notifications"
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={palette.text}
            />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={signOut}
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={22} color={palette.text} />
          </TouchableOpacity>
        </View>

        {/* HERO CARD */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="chatbubbles" size={26} color={palette.onPrimary} />
          </View>
          <Text style={styles.heroTitle}>Need help?</Text>
          <Text style={styles.heroText}>
            Chat with our support team. We usually reply within minutes.
          </Text>
          <TouchableOpacity
            style={styles.heroButton}
            activeOpacity={0.85}
            onPress={() => router.push("/support-chat")}
          >
            <Text style={styles.heroButtonText}>Start a chat</Text>
            <Ionicons name="arrow-forward" size={18} color={palette.primary} />
          </TouchableOpacity>
        </View>

        {/* HOW IT WORKS */}
        <Text style={styles.sectionTitle}>How it works</Text>
        {STEPS.map((step) => (
          <View key={step.title} style={styles.stepCard}>
            <View style={styles.stepIcon}>
              <Ionicons name={step.icon} size={20} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.background },
    content: { padding: 24, paddingBottom: 48 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 24,
    },
    eyebrow: { color: p.textMuted, fontSize: 14 },
    title: { color: p.text, fontSize: 26, fontWeight: "800", marginTop: 2 },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: "center",
      justifyContent: "center",
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -4,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
    hero: {
      backgroundColor: p.primary,
      borderRadius: 28,
      padding: 24,
      marginBottom: 32,
    },
    heroIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    heroTitle: {
      color: p.onPrimary,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 6,
    },
    heroText: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 20,
    },
    heroButton: {
      backgroundColor: "#ffffff",
      borderRadius: 999,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    heroButtonText: { color: p.primary, fontSize: 16, fontWeight: "700" },
    sectionTitle: {
      color: p.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 12,
    },
    stepCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
    },
    stepIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: p.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    stepTitle: {
      color: p.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 2,
    },
    stepText: { color: p.textMuted, fontSize: 13, lineHeight: 18 },
  });
