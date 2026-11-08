import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Palette, usePalette } from "../constants/theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../providers/AuthProvider";
import type { AppNotification } from "../types/database";

// "5m ago", "3h ago", "2d ago"
const timeAgo = (iso: string) => {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = makeStyles(palette);
  const { session } = useAuth();
  const userId = session?.user.id;

  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load the inbox, then listen for new notifications
  useEffect(() => {
    if (!userId) return;

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setItems(data ?? []);
        setIsLoading(false);
      });

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on<AppNotification>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => setItems((prev) => [payload.new, ...prev]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    );
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", ids);
  };

  const openNotification = (item: AppNotification) => {
    markRead([item.id]);
    if (item.route) router.push(item.route as never);
  };

  const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => openNotification(item)}
    >
      <View style={styles.cardIcon}>
        <Ionicons
          name="chatbubble-ellipses"
          size={18}
          color={palette.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text
            style={[styles.cardTitle, !item.is_read && { fontWeight: "800" }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={styles.cardBody} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={() => markRead(unreadIds)}
          disabled={!unreadIds.length}
        >
          <Text
            style={[
              styles.markAll,
              { color: unreadIds.length ? palette.primary : palette.textMuted },
            ]}
          >
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons
                name="notifications-off-outline"
                size={48}
                color={palette.textMuted}
              />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>
                Replies from our support team will show up here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.background },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 14,
      backgroundColor: p.surface,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: p.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { flex: 1, color: p.text, fontSize: 18, fontWeight: "800" },
    markAll: { fontSize: 13, fontWeight: "700" },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
    },
    cardIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: p.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 3,
    },
    cardTitle: { flex: 1, color: p.text, fontSize: 15, fontWeight: "600" },
    cardTime: { color: p.textMuted, fontSize: 12 },
    cardBody: { color: p.textMuted, fontSize: 13, lineHeight: 18 },
    unreadDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: p.primary,
    },
    emptyTitle: {
      color: p.text,
      fontSize: 17,
      fontWeight: "700",
      marginTop: 12,
    },
    emptyText: {
      color: p.textMuted,
      fontSize: 14,
      textAlign: "center",
      marginTop: 4,
    },
  });
