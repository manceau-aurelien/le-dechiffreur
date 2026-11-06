import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { city, lessonContent as content } from '../content';
import { districtEntry, type DistrictEntry } from '../core/progress/city';
import type { SrsEngine } from '../core/srs/types';
import { useProgress } from '../data/ProgressContext';
import { colors } from './theme';

function statusLabel(entry: DistrictEntry): string {
  switch (entry.status) {
    case 'soon':
      return 'À venir';
    case 'needs_boss':
      return 'Derrière la Porte';
    case 'needs_mastery':
      return `${entry.missing.length} à renforcer pour entrer`;
    case 'open':
      return 'Tu peux entrer';
    case 'entered':
      return `${entry.nodesDone} sur ${entry.nodesTotal}`;
    case 'done':
      return 'Exploré';
  }
}

/** La Ville : le joueur choisit son quartier. */
export function CityMap({ engine }: { engine: SrsEngine }) {
  const { progress, now } = useProgress();
  const t = now();
  return (
    <View style={styles.box}>
      <Text style={styles.kicker}>{`Palier ${city.order}`}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {city.title}
      </Text>
      <Text style={styles.intro}>{city.intro}</Text>
      {city.districts.map((d) => {
        const entry = districtEntry(d, content, progress, engine, t);
        const soon = entry.status === 'soon';
        return (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityState={{ disabled: soon }}
            accessibilityLabel={`${d.title}, ${statusLabel(entry)}`}
            disabled={soon}
            testID={`district-${d.id}`}
            onPress={() => router.push({ pathname: '/quartier/[id]', params: { id: d.id } })}
            style={({ pressed }) => [styles.card, soon && styles.cardSoon, pressed && styles.pressed]}
          >
            <Text style={[styles.name, soon && styles.quiet]}>{d.title}</Text>
            <Text style={styles.promise}>{d.promise}</Text>
            <Text style={[styles.status, entry.status === 'done' && styles.done, (entry.status === 'open' || entry.status === 'entered') && styles.open]}>
              {statusLabel(entry)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  kicker: { color: colors.inkQuiet, fontSize: 14 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  intro: { color: colors.ink, fontSize: 16, lineHeight: 24, marginBottom: 4 },
  card: { borderWidth: 1, borderColor: colors.flame, backgroundColor: colors.brick, borderRadius: 10, padding: 14, gap: 4 },
  cardSoon: { borderColor: colors.stoneEdge, backgroundColor: 'transparent' },
  pressed: { opacity: 0.75 },
  name: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  quiet: { color: colors.inkQuiet },
  promise: { color: colors.inkQuiet, fontSize: 14, lineHeight: 20 },
  status: { color: colors.inkQuiet, fontSize: 13, marginTop: 2 },
  open: { color: colors.flame },
  done: { color: colors.good },
});
