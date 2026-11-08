import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Palette, usePalette } from "../constants/theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../providers/AuthProvider";
import type {
  MessageRole,
  SessionStatus,
  SupportMessage,
  SupportSession,
} from "../types/database";

// Each suggestion except the last one has an answer in the faq_responses table
const SUGGESTIONS = [
  "Where is my order?",
  "How do I get a refund?",
  "What are your opening hours?",
  "Speak to an agent",
];

const HANDOFF_TEXT = "Connecting you to a human agent...";

const STATUS_LABEL: Record<SessionStatus, string> = {
  bot_active: "Assistant • Instant answers",
  needs_admin: "Connecting you to an agent…",
  admin_active: "Agent connected",
  resolved: "Chat closed",
};

// ilike treats % and _ as wildcards; escape them so the FAQ match stays exact
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

export default function SupportChat() {
  const router = useRouter();
  const palette = usePalette();
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id;

  const listRef = useRef<FlatList<SupportMessage>>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>("bot_active");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Realtime and our own inserts can both deliver the same row, so skip duplicates
  const addMessage = useCallback((message: SupportMessage) => {
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message],
    );
  }, []);

  // ---------------------------------------------------------------------------
  // 1. LOAD THE OPEN CHAT AND ITS HISTORY
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;

    const loadHistory = async () => {
      const { data: openChat, error } = await supabase
        .from("support_sessions")
        .select("*")
        .eq("user_id", userId)
        .neq("status", "resolved")
        .maybeSingle();

      if (error) console.error("Loading chat failed:", error.message);

      if (openChat) {
        setSessionId(openChat.id);
        setStatus(openChat.status);

        const { data: history } = await supabase
          .from("support_messages")
          .select("*")
          .eq("session_id", openChat.id)
          .order("created_at", { ascending: true });

        setMessages(history ?? []);
      }
      setIsLoading(false);
    };

    loadHistory();
  }, [userId]);

  // ---------------------------------------------------------------------------
  // 2. REALTIME: AGENT REPLIES AND STATUS CHANGES
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`support-${sessionId}`)
      .on<SupportMessage>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const message = payload.new;
          if (message.role === "user") return; // our own messages are added when we send them
          addMessage(message);
        },
      )
      .on<SupportSession>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => setStatus(payload.new.status),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, addMessage]);

  // ---------------------------------------------------------------------------
  // 3. SENDING
  // ---------------------------------------------------------------------------
  // Finds this user's open chat, or starts a new one (e.g. after an agent closed the last one)
  const getOpenChat = async (): Promise<SupportSession> => {
    const { data: existing, error } = await supabase
      .from("support_sessions")
      .select("*")
      .eq("user_id", userId!)
      .neq("status", "resolved")
      .maybeSingle();
    if (error) throw error;
    if (existing) return existing;

    const { data: created, error: createError } = await supabase
      .from("support_sessions")
      .insert({ user_id: userId!, status: "bot_active" })
      .select()
      .single();
    if (createError) throw createError;
    return created;
  };

  const saveMessage = async (
    chatId: string,
    role: MessageRole,
    content: string,
  ) => {
    const { data, error } = await supabase
      .from("support_messages")
      .insert({
        session_id: chatId,
        role,
        content,
        sender_id: role === "user" ? userId : null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const sendMessage = async (raw: string) => {
    const text = raw.trim();
    if (!text || !userId || isSending) return;

    setInput("");
    setIsSending(true);

    // Show the message straight away, then swap in the saved row
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        session_id: sessionId ?? "",
        sender_id: userId,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    let saved = false;
    try {
      const chat = await getOpenChat();
      if (chat.id !== sessionId) {
        setSessionId(chat.id);
        setStatus(chat.status);
      }

      const savedMessage = await saveMessage(chat.id, "user", text);
      saved = true;
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? savedMessage : m)),
      );

      // A human has the chat: the database webhook relays this message to Telegram
      if (chat.status !== "bot_active") return;

      // The bot answers from the FAQ table when the question matches exactly
      const { data: faq } = await supabase
        .from("faq_responses")
        .select("answer")
        .ilike("question", escapeLike(text))
        .maybeSingle();

      if (faq) {
        addMessage(await saveMessage(chat.id, "bot", faq.answer));
        return;
      }

      // No answer: hand over to a human. This status change fires the Telegram webhook.
      const { error: statusError } = await supabase
        .from("support_sessions")
        .update({ status: "needs_admin", updated_at: new Date().toISOString() })
        .eq("id", chat.id);
      if (statusError) throw statusError;

      setStatus("needs_admin");
      addMessage(await saveMessage(chat.id, "bot", HANDOFF_TEXT));
    } catch (error: any) {
      console.error("Support chat error:", error.message);
      if (!saved) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(text);
      }
      Alert.alert(
        "Something went wrong",
        "Please check your connection and try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. UI
  // ---------------------------------------------------------------------------
  const renderSuggestions = () => {
    if (isLoading || messages.length > 0) return null;
    return (
      <View style={styles.suggestions}>
        <Text style={styles.suggestionsLabel}>Suggested questions</Text>
        <View style={styles.suggestionGrid}>
          {SUGGESTIONS.map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              style={styles.suggestion}
              activeOpacity={0.7}
              onPress={() => sendMessage(suggestion)}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: SupportMessage }) => {
    const isMe = item.role === "user";
    const isAdmin = item.role === "admin";

    if (item.role === "bot" && item.content === HANDOFF_TEXT) {
      return <Text style={styles.systemCue}>— {item.content} —</Text>;
    }

    return (
      <View
        style={[
          styles.messageRow,
          { justifyContent: isMe ? "flex-end" : "flex-start" },
        ]}
      >
        {!isMe && (
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: isAdmin
                  ? palette.successSoft
                  : palette.primarySoft,
              },
            ]}
          >
            <Ionicons
              name={isAdmin ? "person" : "hardware-chip"}
              size={16}
              color={isAdmin ? palette.success : palette.primary}
            />
          </View>
        )}
        <View
          style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
        >
          {isAdmin && <Text style={styles.agentName}>Support Agent</Text>}
          <Text
            style={[
              styles.messageText,
              { color: isMe ? palette.onPrimary : palette.text },
            ]}
          >
            {item.content}
          </Text>
          <Text
            style={[
              styles.time,
              {
                color: isMe ? "rgba(255,255,255,0.75)" : palette.textMuted,
                textAlign: isMe ? "right" : "left",
              },
            ]}
          >
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    );
  };

  const canSend = input.trim().length > 0 && !isSending;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color={palette.text} />
          </TouchableOpacity>
          <View style={styles.headerAvatar}>
            <Ionicons name="chatbubbles" size={20} color={palette.primary} />
            <View
              style={[styles.onlineDot, { borderColor: palette.surface }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Support</Text>
            <Text
              style={[
                styles.headerStatus,
                {
                  color:
                    status === "resolved" ? palette.textMuted : palette.success,
                },
              ]}
            >
              {STATUS_LABEL[status]}
            </Text>
          </View>
        </View>

        {/* MESSAGES */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            ListHeaderComponent={renderSuggestions}
            contentContainerStyle={{ paddingTop: 20, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        {isSending && status === "bot_active" && (
          <View style={styles.typing}>
            <Text style={styles.typingText}>Assistant is typing</Text>
            <ActivityIndicator size="small" color={palette.primary} />
          </View>
        )}

        {/* INPUT BAR */}
        <View
          style={[
            styles.inputBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.inputWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Type a message..."
              placeholderTextColor={palette.textMuted}
              multiline
              style={styles.input}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: canSend ? palette.primary : palette.border },
            ]}
            disabled={!canSend}
            onPress={() => sendMessage(input)}
          >
            <Ionicons
              name="send"
              size={18}
              color={canSend ? palette.onPrimary : palette.textMuted}
              style={{ marginLeft: 3 }}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: p.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    onlineDot: {
      position: "absolute",
      right: 0,
      bottom: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      backgroundColor: p.success,
    },
    headerTitle: { color: p.text, fontSize: 18, fontWeight: "800" },
    headerStatus: { fontSize: 12, fontWeight: "700", marginTop: 2 },
    suggestions: { paddingHorizontal: 16, marginBottom: 24 },
    suggestionsLabel: {
      color: p.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 12,
      marginLeft: 4,
    },
    suggestionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    suggestion: {
      width: "48%",
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 12,
      alignItems: "center",
    },
    suggestionText: {
      color: p.text,
      fontSize: 13,
      fontWeight: "500",
      textAlign: "center",
    },
    systemCue: {
      color: p.textMuted,
      fontSize: 12,
      fontStyle: "italic",
      textAlign: "center",
      marginBottom: 16,
      paddingHorizontal: 16,
    },
    messageRow: {
      flexDirection: "row",
      paddingHorizontal: 16,
      marginBottom: 14,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      alignSelf: "flex-end",
    },
    bubble: {
      maxWidth: "75%",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 18,
    },
    bubbleMe: { backgroundColor: p.primary, borderBottomRightRadius: 4 },
    bubbleThem: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderBottomLeftRadius: 4,
    },
    agentName: {
      color: p.success,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 4,
    },
    messageText: { fontSize: 16, lineHeight: 21 },
    time: { fontSize: 11, marginTop: 4, fontWeight: "500" },
    typing: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 24,
      paddingBottom: 8,
    },
    typingText: { color: p.textMuted, fontSize: 12, fontWeight: "500" },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: p.surface,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    inputWrap: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      justifyContent: "center",
      backgroundColor: p.surfaceMuted,
      borderRadius: 22,
      paddingHorizontal: 16,
    },
    input: { color: p.text, fontSize: 16, paddingTop: 11, paddingBottom: 11 },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
  });
