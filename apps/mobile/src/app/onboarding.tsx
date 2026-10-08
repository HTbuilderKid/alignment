import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getUserDirection,
  saveUserDirection,
} from "../database/userDirectionRepository";

type Stage = "write" | "review";

export default function OnboardingScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [statement, setStatement] = useState("");
  const [stage, setStage] = useState<Stage>("write");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadExistingDirection() {
      const existing = await getUserDirection(db);

      if (existing) {
        setStatement(existing.statement);
      }
    }

    loadExistingDirection();
  }, [db]);

  const canContinue = statement.trim().length >= 10;

  function handleContinue() {
    if (!canContinue) {
      return;
    }

    setStage("review");
  }

  async function handleSave() {
    if (!canContinue || saving) {
      return;
    }

    setSaving(true);

    try {
      await saveUserDirection(db, statement);

      router.replace("/today");
    } finally {
      setSaving(false);
    }
  }

  if (stage === "review") {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>YOUR DIRECTION</Text>

          <Text style={styles.title}>
            This is what Alignment will remember.
          </Text>

          <View style={styles.reviewCard}>
            <Text style={styles.reviewText}>
              {statement.trim()}
            </Text>
          </View>

          <Text style={styles.description}>
            You can change this later. Over time,
            Alignment will use it to understand what
            actually matters to you.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setStage("write")}
          >
            <Text style={styles.secondaryButtonText}>
              Edit
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.primaryButton,
              saving && styles.disabledButton,
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? "Saving..." : "Remember this"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios" ? "padding" : undefined
      }
    >
      <View style={styles.content}>
        <Text style={styles.eyebrow}>
          BEFORE WE BEGIN
        </Text>

        <Text style={styles.title}>
          What are you trying to achieve overall?
        </Text>

        <Text style={styles.description}>
          Don't choose from a list. Tell Alignment,
          in your own words, what you want your life
          to look more like.
        </Text>

        <TextInput
          style={styles.input}
          value={statement}
          onChangeText={setStatement}
          placeholder="For example: I want to stop losing my evenings scrolling, take school more seriously, work consistently on things I care about, and make more time for people."
          placeholderTextColor="#777"
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />

        <Text style={styles.characterCount}>
          {statement.length} / 2000
        </Text>
      </View>

      <Pressable
        style={[
          styles.primaryButton,
          !canContinue && styles.disabledButton,
        ]}
        onPress={handleContinue}
        disabled={!canContinue}
      >
        <Text style={styles.primaryButtonText}>
          Continue
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
    backgroundColor: "#ffffff",
  },

  content: {
    flex: 1,
  },

  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#666",
    marginBottom: 16,
  },

  title: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "700",
    color: "#111",
    marginBottom: 16,
  },

  description: {
    fontSize: 17,
    lineHeight: 25,
    color: "#555",
    marginBottom: 28,
  },

  input: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 18,
    padding: 18,
    fontSize: 17,
    lineHeight: 25,
    color: "#111",
    backgroundColor: "#fafafa",
  },

  characterCount: {
    marginTop: 8,
    textAlign: "right",
    color: "#888",
    fontSize: 13,
  },

  reviewCard: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#f3f3f3",
    marginBottom: 24,
  },

  reviewText: {
    fontSize: 19,
    lineHeight: 29,
    color: "#111",
  },

  actions: {
    gap: 12,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },

  secondaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "600",
  },

  disabledButton: {
    opacity: 0.35,
  },
});