import { CurrentIntentionCard } from '../components/CurrentIntentionCard';
import type {
  AlignmentPromise,
  UserDirection,
} from "@alignment/types";

import {
  type Href,
  useFocusEffect,
  useRouter,
} from "expo-router";

import {
  useSQLiteContext,
} from "expo-sqlite";

import {
  useCallback,
  useState,
} from "react";

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getPromisesForDate,
} from "../database/promiseRepository";

import {
  getUserDirection,
} from "../database/userDirectionRepository";

import {
  getLocalDateKey,
} from "../utils/date";

export default function TodayScreen() {
  const router =
    useRouter();

  const db =
    useSQLiteContext();

  const [
    direction,
    setDirection,
  ] =
    useState<
      UserDirection | null
    >(null);

  const [
    promises,
    setPromises,
  ] =
    useState<
      AlignmentPromise[]
    >([]);

  const refresh =
    useCallback(
      async () => {
        const [
          savedDirection,
          savedPromises,
        ] =
          await Promise.all([
            getUserDirection(
              db
            ),

            getPromisesForDate(
              db,

              getLocalDateKey()
            ),
          ]);

        setDirection(
          savedDirection
        );

        setPromises(
          savedPromises
        );
      },
      [db]
    );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const keptCount =
    promises.filter(
      (promise) =>
        promise.status ===
        "kept"
    ).length;

  const countedPromises =
    promises.filter(
      (promise) =>
        promise.status !==
        "cancelled"
    ).length;

  return (
    <ScrollView
      style={
        styles.container
      }
      contentContainerStyle={
        styles.content
      }
    >
      <Text
        style={
          styles.eyebrow
        }
      >
        TODAY
      </Text>

      <Text
        style={
          styles.title
        }
      >
        Alignment
      </Text>

      <CurrentIntentionCard />

      <View
        style={
          styles.promiseHeader
        }
      >
        <View
          style={
            styles.promiseHeaderText
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Your promises
          </Text>

          <Text
            style={
              styles.sectionDescription
            }
          >
            Keep the minimum. Anything
            beyond it is extra.
          </Text>
        </View>

        <Pressable
          style={
            styles.addButton
          }
          onPress={() =>
            router.push(
              "/promise/new" as Href
            )
          }
        >
          <Text
            style={
              styles.addButtonText
            }
          >
            +
          </Text>
        </Pressable>
      </View>

      {promises.length ===
      0 ? (
        <View
          style={
            styles.emptyCard
          }
        >
          <Text
            style={
              styles.emptyTitle
            }
          >
            No promises yet.
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            Make one small,
            deliberate commitment
            for today.
          </Text>

          <Pressable
            style={
              styles.primaryButton
            }
            onPress={() =>
              router.push(
                "/promise/new" as Href
              )
            }
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Make a promise
            </Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={
            styles.promiseList
          }
        >
          {promises.map(
            (promise) => (
              <PromiseCard
                key={
                  promise.id
                }
                promise={
                  promise
                }
                onPress={() =>
                  router.push(
                    `/promise/${promise.id}` as Href
                  )
                }
              />
            )
          )}
        </View>
      )}

      {countedPromises >
        0 && (
        <View
          style={
            styles.reliabilityCard
          }
        >
          <Text
            style={
              styles.reliabilityLabel
            }
          >
            TODAY&apos;S FOLLOW-THROUGH
          </Text>

          <Text
            style={
              styles.reliabilityValue
            }
          >
            {keptCount} of{" "}
            {countedPromises} promises
            kept so far
          </Text>
        </View>
      )}

      <Text
        style={
          styles.sectionLabel
        }
      >
        WHAT YOU&apos;RE WORKING TOWARD
      </Text>

      {direction ? (
        <View
          style={
            styles.directionCard
          }
        >
          <Text
            style={
              styles.statement
            }
          >
            {direction.statement}
          </Text>
        </View>
      ) : (
        <Text
          style={
            styles.loading
          }
        >
          Loading...
        </Text>
      )}

      <Pressable
        style={
          styles.compassButton
        }
        onPress={() =>
          router.push(
            "/compass"
          )
        }
      >
        <Text
          style={
            styles.compassButtonText
          }
        >
          Open Compass
        </Text>
      </Pressable>

      <Pressable
        style={
          styles.secondaryButton
        }
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
    </ScrollView>
  );
}

type PromiseCardProps = {
  promise:
    AlignmentPromise;

  onPress:
    () => void;
};

function PromiseCard({
  promise,
  onPress,
}: PromiseCardProps) {
  return (
    <Pressable
      style={
        styles.promiseCard
      }
      onPress={
        onPress
      }
    >
      <View
        style={
          styles.promiseCardTop
        }
      >
        <Text
          style={
            styles.promiseTitle
          }
        >
          {promise.title}
        </Text>

        <Text
          style={
            styles.promiseStatus
          }
        >
          {formatStatus(
            promise.status
          )}
        </Text>
      </View>

      <Text
        style={
          styles.minimumText
        }
      >
        Minimum:{" "}
        {promise.minimum
          .description}

        {promise.minimum
          .amount !==
        null
          ? ` — ${promise.minimum.amount} ${promise.minimum.unit ?? ""}`
          : ""}
      </Text>
    </Pressable>
  );
}

function formatStatus(
  status:
    AlignmentPromise[
      "status"
    ]
): string {
  switch (status) {
    case "planned":
      return "PLANNED";

    case "active":
      return "IN PROGRESS";

    case "kept":
      return "KEPT";

    case "missed":
      return "MISSED";

    case "cancelled":
      return "CANCELLED";
  }
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#fff",
    },

    content: {
      paddingHorizontal: 24,
      paddingTop: 72,
      paddingBottom: 56,
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
      marginBottom: 34,
    },

    promiseHeader: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 16,
    },

    promiseHeaderText: {
      flex: 1,
    },

    sectionTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: "#111",
    },

    sectionDescription: {
      fontSize: 15,
      lineHeight: 22,
      color: "#666",
      marginTop: 5,
    },

    addButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "#111",
      alignItems: "center",
      justifyContent:
        "center",
    },

    addButtonText: {
      color: "#fff",
      fontSize: 27,
      lineHeight: 29,
    },

    promiseList: {
      gap: 10,
      marginTop: 18,
    },

    promiseCard: {
      padding: 18,
      borderWidth: 1,
      borderColor: "#e1e1e1",
      borderRadius: 17,
    },

    promiseCardTop: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      gap: 14,
    },

    promiseTitle: {
      flex: 1,
      fontSize: 17,
      lineHeight: 24,
      fontWeight: "700",
      color: "#111",
    },

    promiseStatus: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
      color: "#777",
    },

    minimumText: {
      fontSize: 14,
      lineHeight: 21,
      color: "#666",
      marginTop: 9,
    },

    emptyCard: {
      padding: 20,
      borderRadius: 18,
      backgroundColor:
        "#f4f4f4",
      marginTop: 18,
    },

    emptyTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: "#111",
    },

    emptyText: {
      fontSize: 15,
      lineHeight: 22,
      color: "#666",
      marginTop: 6,
    },

    primaryButton: {
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: "#111",
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 16,
    },

    primaryButtonText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "700",
    },

    reliabilityCard: {
      paddingVertical: 18,
      marginTop: 18,
      marginBottom: 38,
      borderBottomWidth: 1,
      borderBottomColor:
        "#eee",
    },

    reliabilityLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      color: "#888",
    },

    reliabilityValue: {
      fontSize: 16,
      fontWeight: "600",
      color: "#333",
      marginTop: 6,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: "#777",
      marginBottom: 12,
    },

    directionCard: {
      padding: 22,
      borderRadius: 18,
      backgroundColor:
        "#f3f3f3",
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

    compassButton: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "#ddd",
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 18,
    },

    compassButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#222",
    },

    secondaryButton: {
      minHeight: 50,
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 6,
    },

    secondaryButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: "#555",
    },
  });