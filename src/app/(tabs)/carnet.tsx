import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../../audio/AudioService';
import { lessonContent as content, sayClip } from '../../content';
import { annaNotes, formulaEntries, trapEntries } from '../../core/progress/collections';
import { sentence } from '../../core/exercise/generate';
import { useProgress } from '../../data/ProgressContext';
import { QuietButton } from '../../ui/components';
import { colors, MAX_WIDTH } from '../../ui/theme';

const TRAP_KIND = { false_friend: 'Faux ami', calque: 'Calque du français' };

/** Le Carnet d'Anna : les formules prouvées, le Bestiaire des pièges, ses notes. */
export default function NotebookScreen() {
  const { progress, loaded } = useProgress();
  if (!loaded) return <View style={styles.screen} />;

  const formulas = formulaEntries(content, progress);
  const traps = trapEntries(content, progress);
  const notes = annaNotes(content, progress);
  const met = traps.filter((t) => t.met).length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Le Carnet
        </Text>

        <Text style={styles.section}>Formules</Text>
        {formulas.map(({ formula, unsealed }) =>
          unsealed ? (
            <View key={formula.id} style={styles.card} testID={`formula-${formula.id}`}>
              <Text style={styles.cardTitle}>{formula.title}</Text>
              <Text style={styles.pattern}>{formula.pattern}</Text>
              <Text style={styles.body}>{formula.ruleText}</Text>
              {formula.clueSentenceIds.map((id) => {
                const s = sentence(content, id);
                return (
                  <View key={id} style={styles.example}>
                    <View style={styles.exampleText}>
                      <Text style={styles.exampleEn}>{s.en}</Text>
                      <Text style={styles.exampleFr}>{s.fr}</Text>
                    </View>
                    <QuietButton label="Écouter" testID={`listen-${id}`} onPress={() => audio.play(sayClip('voiceA', s.en))} />
                  </View>
                );
              })}
            </View>
          ) : (
            <View key={formula.id} style={[styles.card, styles.sealed]} testID={`formula-${formula.id}`}>
              <Text style={styles.sealedTitle}>Formule scellée</Text>
              <Text style={styles.quiet}>Prouve-la sur la Carte pour lire sa règle.</Text>
            </View>
          ),
        )}

        <Text style={styles.section} testID="bestiary-count">{`Bestiaire des pièges : ${met} sur ${traps.length}`}</Text>
        {traps.map(({ trap, met: isMet }) =>
          isMet ? (
            <View key={trap.id} style={styles.card} testID={`trap-${trap.id}`}>
              <Text style={styles.kind}>{TRAP_KIND[trap.kind]}</Text>
              <Text style={styles.cardTitle}>{trap.title}</Text>
              <Text style={styles.body}>{`${trap.fr} → ${trap.en}`}</Text>
              <Text style={styles.lesson}>{trap.lesson}</Text>
            </View>
          ) : (
            <View key={trap.id} style={[styles.card, styles.sealed]} testID={`trap-${trap.id}`}>
              <Text style={styles.sealedTitle}>Piège inconnu</Text>
            </View>
          ),
        )}

        <Text style={styles.section}>Notes d&apos;Anna</Text>
        {notes.length ? (
          notes.map((n) => (
            <Text key={n.key} style={styles.note} testID={`note-${n.key}`}>
              « {n.text} »
            </Text>
          ))
        ) : (
          <Text style={styles.quiet}>Les pages se dévoileront au fil de ton chemin.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 22, gap: 12, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  section: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 10 },
  card: { borderWidth: 1, borderColor: colors.stoneEdge, backgroundColor: colors.brick, borderRadius: 10, padding: 14, gap: 6 },
  sealed: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  sealedTitle: { color: colors.inkQuiet, fontSize: 15, fontWeight: '600' },
  quiet: { color: colors.inkQuiet, fontSize: 14, lineHeight: 20 },
  kind: { color: colors.inkQuiet, fontSize: 12 },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  pattern: { color: colors.gold, fontSize: 15 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  lesson: { color: colors.gold, fontSize: 14, lineHeight: 20 },
  example: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.brickEdge, paddingTop: 8 },
  exampleText: { flex: 1 },
  exampleEn: { color: colors.ink, fontSize: 15 },
  exampleFr: { color: colors.inkQuiet, fontSize: 14 },
  note: { color: colors.ink, fontSize: 15, fontStyle: 'italic', lineHeight: 23 },
});
