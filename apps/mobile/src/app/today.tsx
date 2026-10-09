import type {
  UserDirection,
} from "@alignment/types";

import {
  useRouter,
} from "expo-router";

import {
  useSQLiteContext,
} from "expo-sqlite";

import {
  useEffect,
  useState,
} from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getUserDirection,
} from "../database/userDirectionRepository";

export default function TodayScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [direction, setDirection] =
    useState<UserDirection | null>(
      null
    );

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
      <Text style={styles.eyebrow}>
        TODAY
      </Text>

      <Text style={styles.title}>
        Alignment
      </Text>

      <Text style={styles.sectionLabel}>
        WHAT YOU'RE WORKING TOWARD
      </Text>

      {direction ? (
        <View style={styles.card}>
          <Text
            style={
              styles.statement
            }
          >
            {direction.statement}
          </Text>
        </View>
      ) : (
        <Text style={styles.loading}>
          Loading...
        </Text>
      )}

      <Pressable
        style={styles.primaryButton}
        onPress={() =>
          router.push("/compass")
        }
      >
        <Text
          style={
            styles.primaryButtonText
          }
        >
          Open Compass
        </Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() =>
          router.push(
            "/onboarding"
          )
        }
      >
        <Text
          style={
            styles.secondaryButtonText
          }
        >
          Change my overall direction
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
  },

  title: {
    fontSize: 36,
    fontWeight: "700",
    color: "#111",
    marginTop: 8,
    marginBottom: 36,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#777",
    marginBottom: 12,
  },

  card: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#f3f3f3",
  },

  statement: {
    fontSize: 18,
    lineHeight: 28,
    color: "#111",
  },

  loading: {
    fontSize: 17,
    color: "#777",
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },

  primaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },

  secondaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#444",
  },
});