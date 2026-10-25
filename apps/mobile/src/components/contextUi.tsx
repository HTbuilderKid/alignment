import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReactNode } from "react";

export function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[ui.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={ui.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={ui.group}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        autoCapitalize="none"
        style={ui.input}
      />
    </View>
  );
}
export function Choices<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={ui.row}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[ui.chip, value === option.value && ui.selected]}
        >
          <Text>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={ui.card}>{children}</View>;
}
export const ui = StyleSheet.create({
  page: {
    padding: 24,
    gap: 16,
    paddingBottom: 80,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 26, fontWeight: "700", color: "#172b25" },
  heading: { fontSize: 18, fontWeight: "600", color: "#172b25" },
  body: { fontSize: 16, lineHeight: 24, color: "#34473e" },
  muted: { fontSize: 14, lineHeight: 21, color: "#52625b" },
  error: { color: "#9b2d20", fontSize: 15 },
  card: {
    backgroundColor: "#f1f6f2",
    padding: 18,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d4e1d7",
  },
  button: {
    backgroundColor: "#234f3d",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#9aae9f",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  group: { gap: 6 },
  label: { fontSize: 15, fontWeight: "600", color: "#34473e" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#bac9bd",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  selected: { backgroundColor: "#c9e3d1", borderColor: "#234f3d" },
});
