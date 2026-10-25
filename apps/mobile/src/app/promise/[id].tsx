import { CurrentIntentionCard } from '../../components/CurrentIntentionCard';
import { executeCommand } from '../../application/commands';
import { getContextRevision } from '../../database/contextRepository';
import { commandKey } from '../../utils/contextTime';
import type {
  AlignmentPromise,
  BehaviorEvent,
  PromiseFailureReason,
  PromiseMeasure,
} from "@alignment/types";

import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";

import {
  useSQLiteContext,
} from "expo-sqlite";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getBehaviorEventsForPromise,
} from "../../database/behaviorEventRepository";

import {
  cancelPromise,
  getPromiseById,
  markPromiseMissed,
  markTargetReached,
  reducePromiseMinimum,
} from "../../database/promiseRepository";

type FailureOption = {
  value:
    PromiseFailureReason;

  label: string;
};

const FAILURE_OPTIONS:
  FailureOption[] = [
    {
      value:
        "too_ambitious",

      label:
        "Too ambitious",
    },

    {
      value: "forgot",

      label:
        "I forgot",
    },

    {
      value:
        "plans_changed",

      label:
        "Plans changed",
    },

    {
      value: "avoided",

      label:
        "I kept avoiding it",
    },

    {
      value:
        "unexpected_event",

      label:
        "Something unexpected happened",
    },

    {
      value:
        "chose_something_else",

      label:
        "I deliberately chose something else",
    },

    {
      value: "other",

      label:
        "Other",
    },
  ];

export default function PromiseDetailScreen() {
  const router =
    useRouter();

  const db =
    useSQLiteContext();

  const params =
    useLocalSearchParams<{
      id: string;
    }>();

  const promiseId =
    Number(params.id);

  const [
    promise,
    setPromise,
  ] =
    useState<
      AlignmentPromise | null
    >(null);

  const [
    events,
    setEvents,
  ] =
    useState<
      BehaviorEvent[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    showFailure,
    setShowFailure,
  ] =
    useState(false);

  const [
    failureNote,
    setFailureNote,
  ] =
    useState("");

  const [
    showShrink,
    setShowShrink,
  ] =
    useState(false);

  const [
    shrinkDescription,
    setShrinkDescription,
  ] =
    useState("");

  const [
    shrinkAmount,
    setShrinkAmount,
  ] =
    useState("");

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    now,
    setNow,
  ] =
    useState(() => Date.now());

  const refresh =
    useCallback(
      async () => {
        if (
          !Number.isFinite(
            promiseId
          )
        ) {
          return;
        }

        const [
          savedPromise,
          savedEvents,
        ] =
          await Promise.all([
            getPromiseById(
              db,
              promiseId
            ),

            getBehaviorEventsForPromise(
              db,
              promiseId
            ),
          ]);

        setNow(Date.now());
        setPromise(
          savedPromise
        );

        setEvents(
          savedEvents
        );

        if (
          savedPromise
        ) {
          setShrinkDescription(
            savedPromise
              .minimum
              .description
          );

          setShrinkAmount(
            savedPromise
              .minimum
              .amount ===
              null
              ? ""
              : String(
                  savedPromise
                    .minimum
                    .amount
                )
          );
        }

        setLoading(false);
      },
      [
        db,
        promiseId,
      ]
    );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (
      !promise
        ?.startedAt
    ) {
      return;
    }

    const interval =
      setInterval(
        () => {
          setNow(
            Date.now()
          );
        },
        1000
      );

    return () =>
      clearInterval(
        interval
      );
  }, [
    promise?.startedAt,
  ]);

  const canAct =
    promise &&
    promise.status !==
      "missed" &&
    promise.status !==
      "cancelled";

  const elapsedMinutes =
    useMemo(() => {
      if (
        !promise?.startedAt
      ) {
        return null;
      }

      const milliseconds =
        now -
        new Date(
          promise.startedAt
        ).getTime();

      return Math.max(
        0,
        Math.floor(
          milliseconds /
            60000
        )
      );
    }, [
      promise,
      now,
    ]);

  async function run(
    action:
      () => Promise<void>
  ) {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      await action();

      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View
        style={
          styles.center
        }
      >
        <Text>
          Loading promise...
        </Text>
      </View>
    );
  }

  if (!promise) {
    return (
      <View
        style={
          styles.center
        }
      >
        <Text>
          This promise no longer
          exists.
        </Text>

        <Pressable
          onPress={() =>
            router.replace(
              "/today"
            )
          }
        >
          <Text
            style={
              styles.link
            }
          >
            Back to Today
          </Text>
        </Pressable>
      </View>
    );
  }

  const currentPromise =
    promise;

  async function handleFailure(
    reason:
      PromiseFailureReason
  ) {
    await run(
      async () => {
        await markPromiseMissed(
          db,

          currentPromise.id,

          reason,

          failureNote
        );

        setShowFailure(
          false
        );

        setFailureNote("");
      }
    );
  }

  async function handleShrink() {
    const next:
      PromiseMeasure = {
        kind:
          currentPromise
            .minimum
            .kind,

        description:
          shrinkDescription,

        amount:
          currentPromise
            .minimum
            .kind ===
          "action"
            ? null
            : Number(
                shrinkAmount
              ),

        unit:
          currentPromise
            .minimum
            .unit,
      };

    await run(
      async () => {
        await reducePromiseMinimum(
          db,

          currentPromise.id,

          next
        );

        setShowShrink(
          false
        );
      }
    );
  }

  const minimumCanShrink =
    currentPromise
      .minimum
      .kind ===
      "action" ||
    (
      Number(
        shrinkAmount
      ) > 0 &&
      currentPromise
        .minimum
        .amount !==
        null &&
      Number(
        shrinkAmount
      ) <
        currentPromise
          .minimum
          .amount
    );

  return (
    <ScrollView
      style={
        styles.container
      }
      contentContainerStyle={
        styles.content
      }
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={
          styles.eyebrow
        }
      >
        PROMISE
      </Text>

      <Text
        style={
          styles.title
        }
      >
        {currentPromise.title}
      </Text>

      <View
        style={
          styles.statusRow
        }
      >
        <Text
          style={
            styles.status
          }
        >
          {formatStatus(
            currentPromise.status
          )}
        </Text>

        {elapsedMinutes !==
          null && (
          <Text
            style={
              styles.elapsed
            }
          >
            {elapsedMinutes} min
            since start
          </Text>
        )}
      </View>

      {currentPromise
        .why && (
        <InfoCard
          label="WHY THIS MATTERS"
          value={
            currentPromise
              .why
          }
        />
      )}

      <InfoCard
        label="TARGET"
        value={formatMeasure(
          currentPromise.target
        )}
      />

      <InfoCard
        label="MINIMUM THAT COUNTS"
        value={formatMeasure(
          currentPromise.minimum
        )}
      />

      {currentPromise
        .status ===
        "planned" && (
        <PrimaryButton
          label={
            busy
              ? "Starting..."
              : "Start this promise"
          }
          disabled={busy}
          onPress={() => router.push({ pathname: '/context', params: { promiseId: String(currentPromise.id) } })}
        />
      )}

      <CurrentIntentionCard key={currentPromise.updatedAt} />
      {canAct && currentPromise.status !== 'planned' && (
        <PrimaryButton label="Work on this now" disabled={busy}
          onPress={() => router.push({ pathname: '/context', params: { promiseId: String(currentPromise.id) } })} />
      )}
      {canAct && !currentPromise.minimumReachedAt && currentPromise.status !== 'planned' && (
        <PrimaryButton label="Minimum reached — switch to leisure" disabled={busy}
          onPress={() => router.push({ pathname: '/context', params: { promiseId: String(currentPromise.id), completeMinimum: 'yes' } })} />
      )}
      {currentPromise.minimumReachedAt && <Text>Promise kept. Continuing is optional. Your current intention continues until you change it or its freshness checkpoint passes.</Text>}

      {canAct &&
        !currentPromise
          .minimumReachedAt &&
        currentPromise
          .status !==
          "planned" && (
          <PrimaryButton
            label={
              busy
                ? "Saving..."
                : "I reached the minimum"
            }
            disabled={
              busy
            }
            onPress={() =>
              run(() =>
                getContextRevision(db).then(revision => executeCommand(db, {
                  commandKey: commandKey(), expectedContextRevision: revision,
                  command: { kind: 'ReachPromiseMinimum', promiseId: currentPromise.id },
                })).then(() => undefined)
              )
            }
          />
        )}

      {canAct &&
        currentPromise
          .minimumReachedAt &&
        !currentPromise
          .targetReachedAt && (
          <PrimaryButton
            label={
              busy
                ? "Saving..."
                : "I reached the target too"
            }
            disabled={
              busy
            }
            onPress={() =>
              run(() =>
                markTargetReached(
                  db,

                  currentPromise.id
                )
              )
            }
          />
        )}

      {canAct &&
        !currentPromise
          .minimumReachedAt && (
          <Pressable
            style={
              styles.secondaryButton
            }
            onPress={() =>
              setShowShrink(
                (value) =>
                  !value
              )
            }
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Make the minimum
              smaller
            </Text>
          </Pressable>
        )}

      {showShrink &&
        canAct &&
        !currentPromise
          .minimumReachedAt && (
          <View
            style={
              styles.panel
            }
          >
            <Text
              style={
                styles.panelTitle
              }
            >
              Lower the barrier
            </Text>

            <Text
              style={
                styles.panelText
              }
            >
              Shrinking the minimum is
              not failure. Alignment
              records that the original
              promise felt too large so
              it can learn from it later.
            </Text>

            <TextInput
              style={
                styles.input
              }
              value={
                shrinkDescription
              }
              onChangeText={
                setShrinkDescription
              }
              placeholder="Smaller minimum"
              placeholderTextColor="#888"
            />

            {currentPromise
              .minimum
              .kind !==
              "action" && (
              <TextInput
                style={
                  styles.input
                }
                value={
                  shrinkAmount
                }
                onChangeText={
                  setShrinkAmount
                }
                keyboardType="decimal-pad"
                placeholder="New amount"
                placeholderTextColor="#888"
              />
            )}

            <PrimaryButton
              label="Use smaller minimum"
              disabled={
                busy ||
                !shrinkDescription
                  .trim() ||
                !minimumCanShrink
              }
              onPress={
                handleShrink
              }
            />
          </View>
        )}

      {canAct &&
        !currentPromise
          .minimumReachedAt && (
          <Pressable
            style={
              styles.secondaryButton
            }
            onPress={() =>
              setShowFailure(
                (value) =>
                  !value
              )
            }
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              I didn&apos;t keep this one
            </Text>
          </Pressable>
        )}

      {showFailure &&
        canAct &&
        !currentPromise
          .minimumReachedAt && (
          <View
            style={
              styles.panel
            }
          >
            <Text
              style={
                styles.panelTitle
              }
            >
              What happened?
            </Text>

            <Text
              style={
                styles.panelText
              }
            >
              This is information, not a
              punishment. It helps
              Alignment learn whether the
              problem was planning,
              avoidance, or something
              else.
            </Text>

            <TextInput
              style={[
                styles.input,
                styles.noteInput,
              ]}
              value={
                failureNote
              }
              onChangeText={
                setFailureNote
              }
              placeholder="Optional note"
              placeholderTextColor="#888"
              multiline
              textAlignVertical="top"
            />

            <View
              style={
                styles.failureChoices
              }
            >
              {FAILURE_OPTIONS.map(
                (option) => (
                  <Pressable
                    key={
                      option.value
                    }
                    style={
                      styles.failureButton
                    }
                    disabled={
                      busy
                    }
                    onPress={() =>
                      handleFailure(
                        option.value
                      )
                    }
                  >
                    <Text
                      style={
                        styles.failureButtonText
                      }
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </View>
        )}

      {canAct &&
        !currentPromise
          .minimumReachedAt && (
          <Pressable
            style={
              styles.cancelButton
            }
            disabled={
              busy
            }
            onPress={() =>
              run(() =>
                cancelPromise(
                  db,

                  currentPromise.id
                )
              )
            }
          >
            <Text
              style={
                styles.cancelButtonText
              }
            >
              Cancel this promise
            </Text>
          </Pressable>
        )}

      <View
        style={
          styles.historySection
        }
      >
        <Text
          style={
            styles.sectionTitle
          }
        >
          Behavior history
        </Text>

        <Text
          style={
            styles.sectionDescription
          }
        >
          This is visible during
          development so we can verify
          that the learning foundation
          is recording the right events.
        </Text>

        {events.length ===
        0 ? (
          <Text
            style={
              styles.empty
            }
          >
            No events yet.
          </Text>
        ) : (
          events.map(
            (event) => (
              <View
                key={
                  event.id
                }
                style={
                  styles.eventRow
                }
              >
                <Text
                  style={
                    styles.eventType
                  }
                >
                  {event.type}
                </Text>

                <Text
                  style={
                    styles.eventTime
                  }
                >
                  {new Date(
                    event.occurredAt
                  ).toLocaleString()}
                </Text>
              </View>
            )
          )
        )}
      </View>

      <Pressable
        style={
          styles.backButton
        }
        onPress={() =>
          router.replace(
            "/today"
          )
        }
      >
        <Text
          style={
            styles.backButtonText
          }
        >
          Back to Today
        </Text>
      </Pressable>
    </ScrollView>
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
      return "PROMISE KEPT";

    case "missed":
      return "MISSED";

    case "cancelled":
      return "CANCELLED";
  }
}

function formatMeasure(
  measure:
    PromiseMeasure
): string {
  if (
    measure.kind ===
    "action"
  ) {
    return measure.description;
  }

  return `${measure.description} — ${measure.amount} ${measure.unit ?? ""}`.trim();
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.infoCard
      }
    >
      <Text
        style={
          styles.infoLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.infoValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;

  onPress:
    () => void;

  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.primaryButton,

        disabled &&
          styles.disabled,
      ]}
      disabled={
        disabled
      }
      onPress={
        onPress
      }
    >
      <Text
        style={
          styles.primaryButtonText
        }
      >
        {label}
      </Text>
    </Pressable>
  );
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
      paddingBottom: 60,
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      gap: 16,
      padding: 24,
    },

    link: {
      fontWeight: "700",
    },

    eyebrow: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: "#666",
    },

    title: {
      fontSize: 34,
      lineHeight: 41,
      fontWeight: "700",
      color: "#111",
      marginTop: 8,
      marginBottom: 12,
    },

    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center",
      marginBottom: 24,
    },

    status: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.1,
      color: "#555",
    },

    elapsed: {
      fontSize: 13,
      color: "#777",
    },

    infoCard: {
      padding: 18,
      borderRadius: 16,
      backgroundColor:
        "#f4f4f4",
      marginBottom: 12,
    },

    infoLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      color: "#777",
      marginBottom: 7,
    },

    infoValue: {
      fontSize: 17,
      lineHeight: 25,
      color: "#111",
    },

    primaryButton: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: "#111",
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 16,
      paddingHorizontal: 18,
    },

    primaryButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },

    disabled: {
      opacity: 0.35,
    },

    secondaryButton: {
      minHeight: 50,
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 10,
      paddingHorizontal: 16,
    },

    secondaryButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: "#333",
    },

    panel: {
      padding: 18,
      borderWidth: 1,
      borderColor: "#e1e1e1",
      borderRadius: 16,
      marginTop: 12,
      gap: 12,
    },

    panelTitle: {
      fontSize: 19,
      fontWeight: "700",
      color: "#111",
    },

    panelText: {
      fontSize: 14,
      lineHeight: 21,
      color: "#666",
    },

    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor: "#d7d7d7",
      borderRadius: 13,
      paddingHorizontal: 14,
      fontSize: 15,
      color: "#111",
      backgroundColor:
        "#fafafa",
    },

    noteInput: {
      minHeight: 80,
      paddingTop: 12,
    },

    failureChoices: {
      gap: 8,
    },

    failureButton: {
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: 12,
      padding: 12,
    },

    failureButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#333",
    },

    cancelButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 12,
    },

    cancelButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#777",
    },

    historySection: {
      marginTop: 42,
    },

    sectionTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: "#111",
    },

    sectionDescription: {
      fontSize: 14,
      lineHeight: 21,
      color: "#666",
      marginTop: 6,
      marginBottom: 14,
    },

    empty: {
      color: "#888",
    },

    eventRow: {
      borderBottomWidth: 1,
      borderBottomColor:
        "#eee",
      paddingVertical: 11,
    },

    eventType: {
      fontSize: 14,
      fontWeight: "700",
      color: "#333",
    },

    eventTime: {
      fontSize: 12,
      color: "#888",
      marginTop: 3,
    },

    backButton: {
      minHeight: 52,
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 24,
    },

    backButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#333",
    },
  });