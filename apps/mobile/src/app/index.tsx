import { Redirect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getUserDirection } from "../database/userDirectionRepository";

type Destination = "/onboarding" | "/today" | null;

export default function IndexScreen() {
  const db = useSQLiteContext();

  const [destination, setDestination] =
    useState<Destination>(null);

  useEffect(() => {
    async function checkUserDirection() {
      const direction = await getUserDirection(db);

      if (direction) {
        setDestination("/today");
      } else {
        setDestination("/onboarding");
      }
    }

    checkUserDirection();
  }, [db]);

  if (!destination) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>Alignment</Text>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={destination} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },

  logo: {
    fontSize: 32,
    fontWeight: "700",
  },
});