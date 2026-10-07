import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alignment</Text>

      <Text style={styles.subtitle}>
        Do what you said you'd do.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  title: {
    fontSize: 36,
    fontWeight: "700",
  },

  subtitle: {
    marginTop: 12,
    fontSize: 18,
    textAlign: "center",
  },
});