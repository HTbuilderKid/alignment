import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getUserDirection } from "../database/userDirectionRepository";
import type { UserDirection } from "../types/userDirection";

export default function TodayScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [direction, setDirection] =
    useState<UserDirection | null>(null);

  useEffect(() => {
    async function loadDirection() {
      const savedDirection =
        await getUserDirection(db);

      setDirection(savedDirection);
    }

    loadDirection();
  }, [db]);

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>YOUR DIRECTION</Text>

      <Text style={styles.title}>
        What you're working toward
      </Text>

      {direction ? (
        <View style={styles.card}>
          <Text style={styles.statement}>
            {direction.statement}
          </Text>
        </View>
      ) : (
        <Text style={styles.loading}>
          Loading...
        </Text>
      )}

      <Pressable
        style={styles.editButton}
        onPress={() => router.push("/onboarding")}
      >
        <Text style={styles.editButtonText}>
          Change my direction
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    backgroundColor: "#ffffff",
  },

  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#666",
    marginBottom: 14,
  },

  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111",
    marginBottom: 28,
  },

  card: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#f3f3f3",
  },

  statement: {
    fontSize: 19,
    lineHeight: 29,
    color: "#111",
  },

  loading: {
    fontSize: 17,
    color: "#777",
  },

  editButton: {
    marginTop: 24,
    alignSelf: "flex-start",
  },

  editButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
});