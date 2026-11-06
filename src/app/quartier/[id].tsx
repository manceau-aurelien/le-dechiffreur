import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../../audio/AudioService';
import { city, lessonContent as content, sayClip } from '../../content';
import { canEnter, districtEntry, reuseRows, type ReuseRow } from '../../core/progress/city';
import { nodeStatus } from '../../core/progress/progress';
import { canStartNew } from '../../core/session/expedition';
import { useProgress } from '../../data/ProgressContext';
import { PrimaryButton, QuietButton } from '../../ui/components';
import { goToMap } from '../../ui/lesson/LessonRun';
import { colors, MAX_WIDTH } from '../../ui/theme';

/** Met en valeur le mot réutilisé dans sa phrase. */
function Highlighted({ text, word }: { text: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(?<![\\w'])(${escaped})(?![\\w'])`, 'i'));
  return (
    <Text style={styles.sentence}>
      {parts.map((part, i) => (
        <Text key={i} style={i % 2 === 1 ? styles.word : undefined}>
          {part}
        </Text>
      ))}
    </Text>
  );
}

function Reused({ row }: { row: ReuseRow }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, écouter ${row.after.en}`}
      testID={`reuse-${row.element}`}
      onPress={() => audio.play(sayClip('voiceA', row.after.en))}
      style={({ pressed }) => [styles.reuse, pressed && styles.pressed]}
    >
      <View style={styles.reuseHead}>
        <Text style={styles.reuseTitle}>{row.title}</Text>
        <Text style={[styles.badge, { color: row.mastered ? colors.good : colors.flame }]}>{row.mastered ? 'Maîtrisée' : 'À renforcer'}</Text>
      </View>
      <Text style={styles.uses}>{`Revient dans ${row.uses} phrases du jeu`}</Text>
      <View style={styles.line}>
        <Text style={styles.label}>Au Port</Text>
        <Highlighted text={row.before.en} word={row.word} />
      </View>
      <View style={styles.line}>
        <Text style={styles.label}>Ici</Text>
        <Highlighted text={row.after.en} word={row.word} />
      </View>
      <Text style={styles.how}>{row.how}</Text>
    </Pressable>
  );
}

/** Un quartier : ce qu'on y apprend, les fondamentaux qu'on y réutilise, et la porte d'entrée. */
export default function DistrictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { progress, engine, loaded, now } = useProgress();
  useEffect(() => () => audio.stop(), []);
  if (!loaded || !engine) return <View style={styles.screen} />;
  const district = city.districts.find((d) => d.id === id);
  if (!district || !district.nodes.length) return <Redirect href="/" />;

  const t = now();
  const entry = districtEntry(district, content, progress, engine, t);
  const rows = reuseRows(district, content, progress, engine, t);
  const canLearn = canStartNew({ progress, engine, now: t });
  const nodes = district.nodes.map((n) => ({ ...n, districtId: district.id }));
  const nextUp = nodes.find((n) => progress.nodes[n.id]?.status !== 'completed');
  const openNode = (nodeId: string) => router.push({ pathname: '/lecon/[id]', params: { id: nodeId } });

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{city.title}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {district.title}
        </Text>
        <Text style={styles.promise}>{district.promise}</Text>

        {entry.status === 'needs_boss' ? (
          <Text style={styles.advice} testID="district-advice">Ce quartier s&apos;ouvre une fois le Gardien de la Porte vaincu.</Text>
        ) : null}
        {entry.status === 'needs_mastery' ? (
          <>
            <Text style={styles.advice} testID="district-advice">
              {`Avant d'entrer, renforce ${entry.missing.length > 1 ? `ces ${entry.missing.length} fondamentaux` : 'ce fondamental'} : tu vas t'en servir tout le temps ici.`}
            </Text>
            <PrimaryButton
              label="Renforcer ces briques"
              testID="district-reinforce"
              onPress={() => router.push({ pathname: '/expedition', params: { elements: entry.missing.join(',') } })}
            />
          </>
        ) : null}
        {canEnter(entry) && !canLearn && entry.status !== 'done' ? (
          <Text style={styles.advice} testID="district-advice">Tes briques ont besoin d&apos;entretien avant d&apos;en poser d&apos;autres. Pars 5 minutes depuis le Camp.</Text>
        ) : null}
        {canEnter(entry) && canLearn && nextUp ? (
          <PrimaryButton label={entry.status === 'open' ? `Entrer : ${nextUp.title}` : `Continuer : ${nextUp.title}`} testID="district-enter" onPress={() => openNode(nextUp.id)} />
        ) : null}

        <View style={styles.block}>
          <Text style={styles.heading}>Ce que tu sais déjà va resservir</Text>
          <Text style={styles.body}>Ces fondamentaux reviennent partout en anglais. Ici, ils se combinent à de nouveaux mots. Touche une carte pour l&apos;écouter.</Text>
          {rows.map((row) => (
            <Reused key={row.element} row={row} />
          ))}
        </View>

        {canEnter(entry) ? (
          <View style={styles.block}>
            <Text style={styles.heading}>Le parcours du quartier</Text>
            {nodes.map((n) => {
              const status = nodeStatus(content.tier, progress, n);
              const done = status === 'completed';
              const locked = status === 'locked' || (!done && !canLearn);
              return (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: locked }}
                  accessibilityLabel={`${n.title}, ${done ? 'Terminé' : locked ? 'Verrouillé' : 'Disponible'}`}
                  disabled={locked}
                  testID={`node-${n.id}`}
                  onPress={() => openNode(n.id)}
                  style={({ pressed }) => [styles.node, pressed && styles.pressed]}
                >
                  <Text style={[styles.nodeTitle, locked && styles.quiet]}>{n.title}</Text>
                  <Text style={[styles.nodeStatus, done && styles.done]}>{done ? 'Terminé' : locked ? 'Verrouillé' : 'Disponible'}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <QuietButton label="Retour à la Ville" testID="to-map" onPress={goToMap} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 22, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  kicker: { color: colors.inkQuiet, fontSize: 14 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  promise: { color: colors.ink, fontSize: 17, lineHeight: 25 },
  advice: { color: colors.gold, fontSize: 16, lineHeight: 23 },
  block: { borderTopWidth: 1, borderTopColor: colors.stoneEdge, paddingTop: 14, gap: 10 },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  body: { color: colors.inkQuiet, fontSize: 14, lineHeight: 20 },
  reuse: { borderWidth: 1, borderColor: colors.stoneEdge, backgroundColor: colors.brick, borderRadius: 10, padding: 12, gap: 5 },
  pressed: { opacity: 0.75 },
  reuseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  reuseTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  badge: { fontSize: 13, fontWeight: '700' },
  uses: { color: colors.gold, fontSize: 13 },
  line: { flexDirection: 'row', gap: 8, alignItems: 'baseline' },
  label: { color: colors.inkQuiet, fontSize: 12, width: 44 },
  sentence: { color: colors.ink, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  word: { color: colors.flame, fontWeight: '700' },
  how: { color: colors.inkQuiet, fontSize: 13, lineHeight: 18 },
  node: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.stoneEdge, backgroundColor: colors.brick, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  nodeTitle: { color: colors.ink, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  nodeStatus: { color: colors.inkQuiet, fontSize: 13 },
  quiet: { color: colors.inkQuiet },
  done: { color: colors.good },
});
