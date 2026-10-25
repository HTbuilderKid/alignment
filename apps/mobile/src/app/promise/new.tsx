import type {
  DirectionItem,
  PromiseMeasureKind,
} from "@alignment/types";

import {
  type Href,
  useRouter,
} from "expo-router";

import {
  useSQLiteContext,
} from "expo-sqlite";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getDirectionItems,
} from "../../database/directionModelRepository";

import {
  createPromise,
} from "../../database/promiseRepository";

import {
  getLocalDateKey,
} from "../../utils/date";

type MeasureDraft = {
  kind:
    PromiseMeasureKind;

  description: string;

  amount: string;

  unit: string;
};

const INITIAL_TARGET:
  MeasureDraft = {
    kind: "duration",

    description: "",

    amount: "30",

    unit: "minutes",
  };

const INITIAL_MINIMUM:
  MeasureDraft = {
    kind: "duration",

    description: "",

    amount: "5",

    unit: "minutes",
  };

export default function NewPromiseScreen() {
  const router =
    useRouter();

  const db =
    useSQLiteContext();

  const [
    title,
    setTitle,
  ] =
    useState("");

  const [
    why,
    setWhy,
  ] =
    useState("");

  const [
    directions,
    setDirections,
  ] =
    useState<
      DirectionItem[]
    >([]);

  const [
    directionItemId,
    setDirectionItemId,
  ] =
    useState<
      number | null
    >(null);

  const [
    target,
    setTarget,
  ] =
    useState<
      MeasureDraft
    >(
      INITIAL_TARGET
    );

  const [
    minimum,
    setMinimum,
  ] =
    useState<
      MeasureDraft
    >(
      INITIAL_MINIMUM
    );

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  useEffect(() => {
    async function loadDirections() {
      const items =
        await getDirectionItems(
          db
        );

      setDirections(
        items.filter(
          (item) =>
            item.kind ===
              "toward" &&
            item.status ===
              "active"
        )
      );
    }

    loadDirections();
  }, [db]);

  const canSave =
    useMemo(() => {
      if (
        !title.trim()
      ) {
        return false;
      }

      if (
        !target
          .description
          .trim() ||
        !minimum
          .description
          .trim()
      ) {
        return false;
      }

      for (
        const measure
        of [
          target,
          minimum,
        ]
      ) {
        if (
          measure.kind !==
          "action"
        ) {
          const amount =
            Number(
              measure.amount
            );

          if (
            !Number.isFinite(
              amount
            ) ||
            amount <= 0
          ) {
            return false;
          }
        }
      }

      return true;
    }, [
      title,
      target,
      minimum,
    ]);

  async function handleSave() {
    if (
      !canSave ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const id =
        await createPromise(
          db,
          {
            directionItemId,

            title,

            why,

            target: {
              kind:
                target.kind,

              description:
                target.description,

              amount:
                target.kind ===
                "action"
                  ? null
                  : Number(
                      target.amount
                    ),

              unit:
                target.kind ===
                "duration"
                  ? "minutes"
                  : target.kind ===
                    "count"
                    ? target.unit
                    : null,
            },

            minimum: {
              kind:
                minimum.kind,

              description:
                minimum.description,

              amount:
                minimum.kind ===
                "action"
                  ? null
                  : Number(
                      minimum.amount
                    ),

              unit:
                minimum.kind ===
                "duration"
                  ? "minutes"
                  : minimum.kind ===
                    "count"
                    ? minimum.unit
                    : null,
            },

            scheduledDate:
              getLocalDateKey(),
          }
        );

      router.replace(
        `/promise/${id}` as Href
      );
    } catch (caught) {
      console.error(
        caught
      );

      setError(
        "Alignment couldn't save this promise."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={
        styles.container
      }
      behavior={
        Platform.OS ===
        "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
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
          NEW PROMISE
        </Text>

        <Text
          style={
            styles.title
          }
        >
          What are you promising
          yourself?
        </Text>

        <Text
          style={
            styles.description
          }
        >
          Make it concrete. The
          minimum is what counts as
          keeping the promise; the
          target is what you&apos;d ideally
          like to do.
        </Text>

        <FieldLabel
          text="Promise"
        />

        <TextInput
          style={
            styles.input
          }
          value={title}
          onChangeText={
            setTitle
          }
          placeholder="Work on my game tonight"
          placeholderTextColor="#888"
        />

        <FieldLabel
          text="Why does this matter? (optional)"
        />

        <TextInput
          style={[
            styles.input,
            styles.multilineInput,
          ]}
          value={why}
          onChangeText={
            setWhy
          }
          placeholder="I want to actually finish what I start."
          placeholderTextColor="#888"
          multiline
          textAlignVertical="top"
        />

        <FieldLabel
          text="This supports (optional)"
        />

        <View
          style={
            styles.choiceWrap
          }
        >
          <ChoiceButton
            label="No specific direction"
            selected={
              directionItemId ===
              null
            }
            onPress={() =>
              setDirectionItemId(
                null
              )
            }
          />

          {directions.map(
            (item) => (
              <ChoiceButton
                key={item.id}
                label={
                  item.title
                }
                selected={
                  directionItemId ===
                  item.id
                }
                onPress={() =>
                  setDirectionItemId(
                    item.id
                  )
                }
              />
            )
          )}
        </View>

        <MeasureEditor
          heading="Target"
          helper="What would you ideally like to do?"
          value={target}
          onChange={
            setTarget
          }
        />

        <MeasureEditor
          heading="Minimum"
          helper="On a bad day, what is the smallest version that still counts?"
          value={minimum}
          onChange={
            setMinimum
          }
        />

        {error && (
          <Text
            style={
              styles.error
            }
          >
            {error}
          </Text>
        )}

        <Pressable
          style={[
            styles.primaryButton,

            (
              !canSave ||
              saving
            ) &&
              styles.disabledButton,
          ]}
          disabled={
            !canSave ||
            saving
          }
          onPress={
            handleSave
          }
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            {saving
              ? "Saving..."
              : "Make this promise"}
          </Text>
        </Pressable>

        <Pressable
          style={
            styles.cancelButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.cancelButtonText
            }
          >
            Cancel
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type MeasureEditorProps = {
  heading: string;

  helper: string;

  value: MeasureDraft;

  onChange:
    (
      value:
        MeasureDraft
    ) => void;
};

function MeasureEditor({
  heading,
  helper,
  value,
  onChange,
}: MeasureEditorProps) {
  function setKind(
    kind:
      PromiseMeasureKind
  ) {
    onChange({
      ...value,

      kind,

      amount:
        kind === "action"
          ? ""
          : value.amount ||
            "1",

      unit:
        kind === "duration"
          ? "minutes"
          : kind === "count"
            ? value.unit ===
              "minutes"
              ? "items"
              : value.unit ||
                "items"
            : "",
    });
  }

  return (
    <View
      style={
        styles.measureCard
      }
    >
      <Text
        style={
          styles.measureHeading
        }
      >
        {heading}
      </Text>

      <Text
        style={
          styles.measureHelper
        }
      >
        {helper}
      </Text>

      <View
        style={
          styles.choiceWrap
        }
      >
        <ChoiceButton
          label="Time"
          selected={
            value.kind ===
            "duration"
          }
          onPress={() =>
            setKind(
              "duration"
            )
          }
        />

        <ChoiceButton
          label="Count"
          selected={
            value.kind ===
            "count"
          }
          onPress={() =>
            setKind(
              "count"
            )
          }
        />

        <ChoiceButton
          label="Action"
          selected={
            value.kind ===
            "action"
          }
          onPress={() =>
            setKind(
              "action"
            )
          }
        />
      </View>

      <TextInput
        style={
          styles.input
        }
        value={
          value.description
        }
        onChangeText={(
          description
        ) =>
          onChange({
            ...value,
            description,
          })
        }
        placeholder={
          value.kind ===
          "duration"
            ? "Work on the project"
            : value.kind ===
              "count"
              ? "Read pages"
              : "Open the project and make one meaningful change"
        }
        placeholderTextColor="#888"
      />

      {value.kind !==
        "action" && (
        <View
          style={
            styles.measureRow
          }
        >
          <TextInput
            style={[
              styles.input,
              styles.amountInput,
            ]}
            value={
              value.amount
            }
            onChangeText={(
              amount
            ) =>
              onChange({
                ...value,
                amount,
              })
            }
            keyboardType="decimal-pad"
            placeholder="5"
            placeholderTextColor="#888"
          />

          {value.kind ===
          "duration" ? (
            <View
              style={
                styles.unitStatic
              }
            >
              <Text
                style={
                  styles.unitStaticText
                }
              >
                minutes
              </Text>
            </View>
          ) : (
            <TextInput
              style={[
                styles.input,
                styles.unitInput,
              ]}
              value={
                value.unit
              }
              onChangeText={(
                unit
              ) =>
                onChange({
                  ...value,
                  unit,
                })
              }
              placeholder="pages"
              placeholderTextColor="#888"
            />
          )}
        </View>
      )}
    </View>
  );
}

type ChoiceButtonProps = {
  label: string;

  selected: boolean;

  onPress: () => void;
};

function ChoiceButton({
  label,
  selected,
  onPress,
}: ChoiceButtonProps) {
  return (
    <Pressable
      onPress={
        onPress
      }
      style={[
        styles.choiceButton,

        selected &&
          styles.choiceButtonSelected,
      ]}
    >
      <Text
        style={[
          styles.choiceText,

          selected &&
            styles.choiceTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FieldLabel({
  text,
}: {
  text: string;
}) {
  return (
    <Text
      style={
        styles.fieldLabel
      }
    >
      {text}
    </Text>
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
      paddingBottom: 56,
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
    },

    description: {
      fontSize: 16,
      lineHeight: 24,
      color: "#666",
      marginTop: 12,
      marginBottom: 30,
    },

    fieldLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: "#333",
      marginBottom: 8,
      marginTop: 18,
    },

    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: "#d7d7d7",
      borderRadius: 14,
      paddingHorizontal: 15,
      fontSize: 16,
      color: "#111",
      backgroundColor: "#fafafa",
    },

    multilineInput: {
      minHeight: 92,
      paddingTop: 14,
    },

    choiceWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    choiceButton: {
      borderWidth: 1,
      borderColor: "#d8d8d8",
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 9,
      backgroundColor: "#fff",
    },

    choiceButtonSelected: {
      backgroundColor: "#111",
      borderColor: "#111",
    },

    choiceText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#444",
    },

    choiceTextSelected: {
      color: "#fff",
    },

    measureCard: {
      marginTop: 28,
      padding: 18,
      borderWidth: 1,
      borderColor: "#e1e1e1",
      borderRadius: 18,
      gap: 14,
    },

    measureHeading: {
      fontSize: 21,
      fontWeight: "700",
      color: "#111",
    },

    measureHelper: {
      fontSize: 14,
      lineHeight: 21,
      color: "#666",
      marginTop: -8,
    },

    measureRow: {
      flexDirection: "row",
      gap: 10,
    },

    amountInput: {
      width: 95,
    },

    unitInput: {
      flex: 1,
    },

    unitStatic: {
      flex: 1,
      minHeight: 52,
      justifyContent:
        "center",
      paddingHorizontal: 15,
      borderRadius: 14,
      backgroundColor:
        "#f4f4f4",
    },

    unitStaticText: {
      fontSize: 16,
      color: "#555",
    },

    primaryButton: {
      minHeight: 58,
      borderRadius: 16,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor: "#111",
      marginTop: 32,
    },

    primaryButtonText: {
      color: "#fff",
      fontSize: 17,
      fontWeight: "600",
    },

    disabledButton: {
      opacity: 0.35,
    },

    cancelButton: {
      minHeight: 50,
      alignItems: "center",
      justifyContent:
        "center",
    },

    cancelButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: "#555",
    },

    error: {
      color: "#a33",
      marginTop: 18,
    },
  });