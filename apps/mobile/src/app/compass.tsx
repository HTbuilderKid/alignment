import type {
  DirectionItem,
  DirectionKind,
  DirectionStatus,
  UserDirection,
} from "@alignment/types";

import {
  useSQLiteContext,
} from "expo-sqlite";

import {
  useEffect,
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
  addDirectionItem,
  getDirectionModel,
  renameDirectionItem,
  setDirectionItemStatus,
} from "../database/directionModelRepository";

export default function CompassScreen() {
  const db = useSQLiteContext();

  const [direction, setDirection] =
    useState<UserDirection | null>(
      null
    );

  const [items, setItems] =
    useState<DirectionItem[]>([]);

  const [newToward, setNewToward] =
    useState("");

  const [newReduce, setNewReduce] =
    useState("");

  async function refresh() {
    const model =
      await getDirectionModel(db);

    if (!model) {
      return;
    }

    setDirection(model.direction);
    setItems(model.items);
  }

  useEffect(() => {
    refresh();
  }, [db]);

  async function handleAdd(
    kind: DirectionKind
  ) {
    const title =
      kind === "toward"
        ? newToward
        : newReduce;

    if (!title.trim()) {
      return;
    }

    await addDirectionItem(
      db,
      kind,
      title
    );

    if (kind === "toward") {
      setNewToward("");
    } else {
      setNewReduce("");
    }

    await refresh();
  }

  async function handleRename(
    id: number,
    title: string
  ) {
    await renameDirectionItem(
      db,
      id,
      title
    );

    await refresh();
  }

  async function handleStatus(
    id: number,
    status: DirectionStatus
  ) {
    await setDirectionItemStatus(
      db,
      id,
      status
    );

    await refresh();
  }

  const toward =
    items.filter(
      (item) =>
        item.kind === "toward"
    );

  const reduce =
    items.filter(
      (item) =>
        item.kind === "reduce"
    );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={
        styles.content
      }
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>
        COMPASS
      </Text>

      <Text style={styles.title}>
        Where you're trying to go
      </Text>

      {direction && (
        <View
          style={
            styles.statementCard
          }
        >
          <Text
            style={
              styles.statementLabel
            }
          >
            YOUR OVERALL DIRECTION
          </Text>

          <Text
            style={
              styles.statementText
            }
          >
            {direction.statement}
          </Text>
        </View>
      )}

      <CompassSection
        title="More of"
        description="Things you deliberately want to move toward."
        items={toward}
        newValue={newToward}
        onNewValueChange={
          setNewToward
        }
        onAdd={() =>
          handleAdd("toward")
        }
        onRename={handleRename}
        onStatusChange={
          handleStatus
        }
      />

      <CompassSection
        title="Less of"
        description="Things you deliberately want to reduce."
        items={reduce}
        newValue={newReduce}
        onNewValueChange={
          setNewReduce
        }
        onAdd={() =>
          handleAdd("reduce")
        }
        onRename={handleRename}
        onStatusChange={
          handleStatus
        }
      />
    </ScrollView>
  );
}

type CompassSectionProps = {
  title: string;
  description: string;

  items: DirectionItem[];

  newValue: string;

  onNewValueChange:
    (value: string) => void;

  onAdd: () => void;

  onRename:
    (
      id: number,
      title: string
    ) => Promise<void>;

  onStatusChange:
    (
      id: number,
      status: DirectionStatus
    ) => Promise<void>;
};

function CompassSection({
  title,
  description,
  items,
  newValue,
  onNewValueChange,
  onAdd,
  onRename,
  onStatusChange,
}: CompassSectionProps) {
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

      {items.length === 0 && (
        <Text style={styles.emptyText}>
          Nothing here yet.
        </Text>
      )}

      {items.map((item) => (
        <DirectionRow
          key={item.id}
          item={item}
          onRename={onRename}
          onStatusChange={
            onStatusChange
          }
        />
      ))}

      <View style={styles.addRow}>
        <TextInput
          value={newValue}
          onChangeText={
            onNewValueChange
          }
          placeholder="Add something..."
          placeholderTextColor="#888"
          style={styles.addInput}
          onSubmitEditing={onAdd}
        />

        <Pressable
          style={styles.addButton}
          onPress={onAdd}
        >
          <Text
            style={
              styles.addButtonText
            }
          >
            Add
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

type DirectionRowProps = {
  item: DirectionItem;

  onRename:
    (
      id: number,
      title: string
    ) => Promise<void>;

  onStatusChange:
    (
      id: number,
      status: DirectionStatus
    ) => Promise<void>;
};

function DirectionRow({
  item,
  onRename,
  onStatusChange,
}: DirectionRowProps) {
  const [editing, setEditing] =
    useState(false);

  const [title, setTitle] =
    useState(item.title);

  async function saveRename() {
    if (!title.trim()) {
      setTitle(item.title);
      setEditing(false);
      return;
    }

    await onRename(
      item.id,
      title
    );

    setEditing(false);
  }

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        {editing ? (
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.editInput}
            autoFocus
          />
        ) : (
          <Text
            style={[
              styles.itemTitle,

              item.status ===
                "completed" &&
                styles.completedText,

              item.status ===
                "paused" &&
                styles.pausedText,
            ]}
          >
            {item.title}
          </Text>
        )}

        <Text style={styles.status}>
          {item.status.toUpperCase()}
        </Text>
      </View>

      <View style={styles.actions}>
        {editing ? (
          <>
            <ActionButton
              label="Save"
              onPress={saveRename}
            />

            <ActionButton
              label="Cancel"
              onPress={() => {
                setTitle(
                  item.title
                );

                setEditing(false);
              }}
            />
          </>
        ) : (
          <ActionButton
            label="Edit"
            onPress={() =>
              setEditing(true)
            }
          />
        )}

        {item.status === "active" && (
          <ActionButton
            label="Pause"
            onPress={() =>
              onStatusChange(
                item.id,
                "paused"
              )
            }
          />
        )}

        {item.status === "paused" && (
          <ActionButton
            label="Resume"
            onPress={() =>
              onStatusChange(
                item.id,
                "active"
              )
            }
          />
        )}

        {item.kind === "toward" &&
          item.status === "active" && (
            <ActionButton
              label="Complete"
              onPress={() =>
                onStatusChange(
                  item.id,
                  "completed"
                )
              }
            />
          )}

        {item.status ===
          "completed" && (
          <ActionButton
            label="Reopen"
            onPress={() =>
              onStatusChange(
                item.id,
                "active"
              )
            }
          />
        )}

        <ActionButton
          label="Remove"
          onPress={() =>
            onStatusChange(
              item.id,
              "removed"
            )
          }
        />
      </View>
    </View>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
};

function ActionButton({
  label,
  onPress,
}: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={
        styles.actionButton
      }
    >
      <Text
        style={
          styles.actionButtonText
        }
      >
        {label}
      </Text>
    </Pressable>
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
    paddingBottom: 60,
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
    marginBottom: 24,
  },

  statementCard: {
    padding: 20,
    borderRadius: 18,
    backgroundColor: "#f3f3f3",
    marginBottom: 36,
  },

  statementLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "700",
    color: "#777",
    marginBottom: 8,
  },

  statementText: {
    fontSize: 17,
    lineHeight: 26,
    color: "#111",
  },

  section: {
    marginBottom: 42,
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
    marginBottom: 16,
  },

  emptyText: {
    color: "#888",
    marginBottom: 12,
  },

  itemCard: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },

  itemHeader: {
    gap: 6,
  },

  itemTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    color: "#111",
  },

  completedText: {
    textDecorationLine:
      "line-through",
    color: "#777",
  },

  pausedText: {
    color: "#888",
  },

  status: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#888",
  },

  editInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111",
  },

  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  actionButton: {
    borderWidth: 1,
    borderColor: "#d5d5d5",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },

  addRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },

  addInput: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#111",
  },

  addButton: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#111",
  },

  addButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});