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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  DirectionDraft,
} from "@alignment/types";

import {
  getDirectionModel,
  saveConfirmedDirectionModel,
} from "../database/directionModelRepository";

import {
  analyzeDirection,
} from "../services/directionApi";

type DraftRow = {
  id: number;
  title: string;
};

let nextDraftId = 0;

function createDraft(
  title = ""
): DraftRow {
  nextDraftId += 1;

  return {
    id: nextDraftId,
    title,
  };
}

export default function DirectionSetupScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [statement, setStatement] =
    useState("");

  const [toward, setToward] =
    useState<DraftRow[]>([
      createDraft(),
    ]);

  const [reduce, setReduce] =
    useState<DraftRow[]>([
      createDraft(),
    ]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [analyzing, setAnalyzing] =
    useState(false);

  const [
    analysisError,
    setAnalysisError,
  ] = useState<string | null>(
    null
  );

  useEffect(() => {
    async function load() {
      const model =
        await getDirectionModel(db);

      if (!model) {
        router.replace("/onboarding");
        return;
      }

      setStatement(
        model.direction.statement
      );

      const towardItems =
        model.items.filter(
          (item) =>
            item.kind === "toward"
        );

      const reduceItems =
        model.items.filter(
          (item) =>
            item.kind === "reduce"
        );

      if (towardItems.length > 0) {
        setToward(
          towardItems.map(
            (item) =>
              createDraft(item.title)
          )
        );
      }

      if (reduceItems.length > 0) {
        setReduce(
          reduceItems.map(
            (item) =>
              createDraft(item.title)
          )
        );
      }

      setLoading(false);
    }

    load();
  }, [db, router]);

  function updateDraft(
    kind: "toward" | "reduce",
    id: number,
    title: string
  ) {
    const update = (
      rows: DraftRow[]
    ) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              title,
            }
          : row
      );

    if (kind === "toward") {
      setToward(update);
    } else {
      setReduce(update);
    }
  }

  function addDraft(
    kind: "toward" | "reduce"
  ) {
    if (kind === "toward") {
      setToward((current) => [
        ...current,
        createDraft(),
      ]);
    } else {
      setReduce((current) => [
        ...current,
        createDraft(),
      ]);
    }
  }

  function removeDraft(
    kind: "toward" | "reduce",
    id: number
  ) {
    const remove = (
      rows: DraftRow[]
    ) => {
      const remaining =
        rows.filter(
          (row) => row.id !== id
        );

      return remaining.length > 0
        ? remaining
        : [createDraft()];
    };

    if (kind === "toward") {
      setToward(remove);
    } else {
      setReduce(remove);
    }
  }

  async function handleAnalyze() {
    if (
      analyzing ||
      !statement.trim()
    ) {
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const analysis =
        await analyzeDirection(
          statement
        );

      const towardItems =
        analysis.items
          .filter(
            (item) =>
              item.kind ===
              "toward"
          )
          .map((item) =>
            createDraft(
              item.title
            )
          );

      const reduceItems =
        analysis.items
          .filter(
            (item) =>
              item.kind ===
              "reduce"
          )
          .map((item) =>
            createDraft(
              item.title
            )
          );

      setToward(
        towardItems.length > 0
          ? towardItems
          : [createDraft()]
      );

      setReduce(
        reduceItems.length > 0
          ? reduceItems
          : [createDraft()]
      );
    } catch (error) {
      console.error(error);

      setAnalysisError(
        "Alignment couldn't organize your direction automatically. You can still enter it manually."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  const validCount =
    toward.filter(
      (item) =>
        item.title.trim().length > 0
    ).length +
    reduce.filter(
      (item) =>
        item.title.trim().length > 0
    ).length;

  async function handleConfirm() {
    if (
      validCount === 0 ||
      saving
    ) {
      return;
    }

    const drafts: DirectionDraft[] = [
      ...toward.map((item) => ({
        kind: "toward" as const,
        title: item.title,
      })),

      ...reduce.map((item) => ({
        kind: "reduce" as const,
        title: item.title,
      })),
    ];

    setSaving(true);

    try {
      await saveConfirmedDirectionModel(
        db,
        drafts
      );

      router.replace("/today");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View
        style={styles.loadingContainer}
      >
        <Text>
          Loading your direction...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios"
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
        <Text style={styles.eyebrow}>
          YOUR DIRECTION
        </Text>

        <Text style={styles.title}>
          What does that mean for you?
        </Text>

        <Text style={styles.description}>
          Break what you wrote into a few
          things you want more of and things
          you want less of.
        </Text>

        <View style={styles.statementCard}>
          <Text
            style={
              styles.statementLabel
            }
          >
            WHAT YOU SAID
          </Text>

          <Text
            style={
              styles.statementText
            }
          >
            {statement}
          </Text>
        </View>

        <View style={styles.aiSection}>
          <Text style={styles.aiTitle}>
            Let Alignment organize this
          </Text>

          <Text
            style={
              styles.aiDescription
            }
          >
            Alignment can turn what you wrote
            into a few suggested directions.
            Nothing is saved until you review
            and confirm it.
          </Text>

          <Pressable
            style={[
              styles.analyzeButton,

              analyzing &&
                styles.disabledButton,
            ]}
            disabled={analyzing}
            onPress={handleAnalyze}
          >
            <Text
              style={
                styles.analyzeButtonText
              }
            >
              {analyzing
                ? "Understanding..."
                : "Suggest from what I wrote"}
            </Text>
          </Pressable>

          {analysisError && (
            <Text
              style={
                styles.errorText
              }
            >
              {analysisError}
            </Text>
          )}
        </View>

        <DirectionSection
          title="Things I want more of"
          description="Behaviors, priorities, or parts of life you want to move toward."
          rows={toward}
          placeholder="For example: Work consistently on my game"
          onChange={(id, title) =>
            updateDraft(
              "toward",
              id,
              title
            )
          }
          onAdd={() =>
            addDraft("toward")
          }
          onRemove={(id) =>
            removeDraft(
              "toward",
              id
            )
          }
        />

        <DirectionSection
          title="Things I want less of"
          description="Things you want to reduce, not things Alignment has decided are bad."
          rows={reduce}
          placeholder="For example: Unintentional evening scrolling"
          onChange={(id, title) =>
            updateDraft(
              "reduce",
              id,
              title
            )
          }
          onAdd={() =>
            addDraft("reduce")
          }
          onRemove={(id) =>
            removeDraft(
              "reduce",
              id
            )
          }
        />

        <Pressable
          style={[
            styles.confirmButton,

            validCount === 0 &&
              styles.disabledButton,
          ]}
          disabled={
            validCount === 0 ||
            saving
          }
          onPress={handleConfirm}
        >
          <Text
            style={
              styles.confirmButtonText
            }
          >
            {saving
              ? "Saving..."
              : "Confirm my direction"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type DirectionSectionProps = {
  title: string;
  description: string;

  rows: DraftRow[];

  placeholder: string;

  onChange: (
    id: number,
    title: string
  ) => void;

  onAdd: () => void;

  onRemove: (
    id: number
  ) => void;
};

function DirectionSection({
  title,
  description,
  rows,
  placeholder,
  onChange,
  onAdd,
  onRemove,
}: DirectionSectionProps) {
  return (
    <View style={styles.section}>
      <Text
        style={styles.sectionTitle}
      >
        {title}
      </Text>

      <Text
        style={
          styles.sectionDescription
        }
      >
        {description}
      </Text>

      {rows.map((row) => (
        <View
          key={row.id}
          style={styles.inputRow}
        >
          <TextInput
            style={styles.input}
            value={row.title}
            onChangeText={(value) =>
              onChange(
                row.id,
                value
              )
            }
            placeholder={placeholder}
            placeholderTextColor="#888"
          />

          <Pressable
            style={
              styles.removeButton
            }
            onPress={() =>
              onRemove(row.id)
            }
          >
            <Text
              style={
                styles.removeText
              }
            >
              ×
            </Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        style={styles.addButton}
        onPress={onAdd}
      >
        <Text
          style={
            styles.addButtonText
          }
        >
          + Add another
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 48,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#666",
    marginBottom: 14,
  },

  title: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "700",
    color: "#111",
    marginBottom: 14,
  },

  description: {
    fontSize: 17,
    lineHeight: 25,
    color: "#555",
    marginBottom: 24,
  },

  statementCard: {
    backgroundColor: "#f3f3f3",
    padding: 20,
    borderRadius: 18,
    marginBottom: 36,
  },

  statementLabel: {
    fontSize: 11,
    letterSpacing: 1.3,
    fontWeight: "700",
    color: "#777",
    marginBottom: 10,
  },

  statementText: {
    fontSize: 17,
    lineHeight: 26,
    color: "#111",
  },

  aiSection: {
    padding: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 18,
    marginBottom: 36,
  },

  aiTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },

  aiDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: "#666",
    marginBottom: 16,
  },

  analyzeButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  analyzeButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },

  errorText: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "#a33",
  },

  section: {
    marginBottom: 36,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
  },

  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: "#666",
    marginTop: 6,
    marginBottom: 16,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#fafafa",
    color: "#111",
  },

  removeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  removeText: {
    fontSize: 28,
    color: "#777",
  },

  addButton: {
    alignSelf: "flex-start",
    paddingVertical: 10,
  },

  addButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },

  confirmButton: {
    minHeight: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    marginTop: 8,
  },

  confirmButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },

  disabledButton: {
    opacity: 0.35,
  },
});