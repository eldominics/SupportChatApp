import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Palette, usePalette } from "../constants/theme";
import { signIn, signUp } from "../lib/auth";

type Mode = "sign-in" | "sign-up";

export default function SignInScreen() {
  const palette = usePalette();
  const styles = makeStyles(palette);

  const [mode, setMode] = useState<Mode>("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";
  const canSubmit =
    email.includes("@") &&
    password.length >= 6 &&
    (!isSignUp || fullName.trim().length > 1) &&
    !isSubmitting;

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      if (isSignUp) await signUp(fullName.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
      // No navigation needed: the protected routes in _layout.tsx switch to the app
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* BRAND */}
          <View style={styles.logo}>
            <Ionicons name="chatbubbles" size={34} color={palette.onPrimary} />
          </View>
          <Text style={styles.title}>Telegram Support</Text>
          <Text style={styles.subtitle}>
            Help from a real person, right inside the app.
          </Text>

          {/* MODE TOGGLE */}
          <View style={styles.toggle}>
            {(["sign-in", "sign-up"] as Mode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.toggleOption,
                  mode === m && styles.toggleOptionActive,
                ]}
                onPress={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                <Text
                  style={[
                    styles.toggleText,
                    mode === m && styles.toggleTextActive,
                  ]}
                >
                  {m === "sign-in" ? "Sign in" : "Create account"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* FORM */}
          {isSignUp && (
            <>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Jane Doe"
                placeholderTextColor={palette.textMuted}
                autoComplete="name"
                style={styles.input}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={palette.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={palette.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={[
                styles.input,
                { flex: 1, marginBottom: 0, borderWidth: 0 },
              ]}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eye}
              accessibilityLabel={
                showPassword ? "Hide password" : "Show password"
              }
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={palette.textMuted}
              />
            </TouchableOpacity>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: canSubmit ? palette.primary : palette.border },
            ]}
            disabled={!canSubmit}
            onPress={handleSubmit}
          >
            {isSubmitting ? (
              <ActivityIndicator color={palette.onPrimary} />
            ) : (
              <Text
                style={[
                  styles.buttonText,
                  { color: canSubmit ? palette.onPrimary : palette.textMuted },
                ]}
              >
                {isSignUp ? "Create account" : "Sign in"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.background },
    content: { padding: 24, paddingTop: 48 },
    logo: {
      width: 72,
      height: 72,
      borderRadius: 24,
      backgroundColor: p.primary,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 20,
    },
    title: {
      color: p.text,
      fontSize: 26,
      fontWeight: "800",
      textAlign: "center",
    },
    subtitle: {
      color: p.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 28,
    },
    toggle: {
      flexDirection: "row",
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 16,
      padding: 4,
      marginBottom: 24,
    },
    toggleOption: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
    },
    toggleOptionActive: { backgroundColor: p.primary },
    toggleText: { color: p.textMuted, fontWeight: "700", fontSize: 14 },
    toggleTextActive: { color: p.onPrimary },
    label: {
      color: p.textMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    input: {
      color: p.text,
      fontSize: 16,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 18,
    },
    passwordRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 14,
      marginBottom: 18,
    },
    eye: { paddingHorizontal: 14, paddingVertical: 12 },
    error: { color: "#dc2626", fontSize: 14, marginBottom: 14 },
    button: {
      borderRadius: 999,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 6,
    },
    buttonText: { fontSize: 16, fontWeight: "700" },
  });
