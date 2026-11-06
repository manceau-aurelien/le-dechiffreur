import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { databaseLock } from '../data/databaseLock';
import { colors, MAX_WIDTH } from './theme';

/** Recouvre l'écran quand le jeu tourne déjà dans un autre onglet. Disparaît seul dès qu'il se ferme. */
export function DatabaseBusy() {
  const [busy, setBusy] = useState(false);
  useEffect(() => databaseLock.subscribe(setBusy), []);
  if (!busy) return null;
  return (
    <View style={styles.screen} testID="database-busy">
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Le jeu est déjà ouvert
        </Text>
        <Text style={styles.body}>Ta progression ne peut s&apos;ouvrir que dans un seul onglet à la fois. Ferme l&apos;autre onglet du jeu : celui-ci reprendra tout seul.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 10, justifyContent: 'center', backgroundColor: colors.stoneLight },
  content: { padding: 24, gap: 12, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 17, lineHeight: 25 },
});
