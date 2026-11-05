import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../audio/AudioService';
import { brick, bricks, sayClip, steleClip, tier } from '../content';
import { steleProgress, steleWords, toRunes, type SteleWord } from '../core/progress/collections';
import { useProgress } from '../data/ProgressContext';
import { QuietButton } from '../ui/components';
import { goToMap } from '../ui/lesson/LessonRun';
import { colors, MAX_WIDTH } from '../ui/theme';

/** La Stèle : le dernier message d'Anna, déchiffré brique après brique. */
export default function SteleScreen() {
  const { progress, loaded } = useProgress();
  const [selected, setSelected] = useState<SteleWord | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => () => audio.stop(), []);

  if (!loaded) return <View style={styles.screen} />;

  const words = steleWords(tier.stele.en, bricks, progress);
  const { known, total, complete } = steleProgress(words);
  const bossNode = tier.nodes[tier.nodes.length - 1];
  const bossBeaten = progress.nodes[bossNode.id]?.status === 'completed';

  const touch = (w: SteleWord) => {
    setSelected(w);
    if (w.known) audio.play(sayClip('voiceA', brick(w.brickId).en));
  };

  const readAloud = async () => {
    setReading(true);
    await audio.play(steleClip(tier.id));
    setReading(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          La Stèle
        </Text>
        <Text style={styles.count} testID="stele-page-count">{`${known} mots déchiffrés sur ${total}`}</Text>

        <View style={styles.stone} testID="stele-text">
          {words.map((w) => (
            <Pressable
              key={w.key}
              accessibilityRole="button"
              accessibilityLabel={w.known ? w.word : 'Mot inconnu'}
              testID={`stele-word-${w.key}`}
              onPress={() => touch(w)}
            >
              <Text style={[styles.word, !w.known && styles.rune]}>
                {w.known ? w.word : toRunes(w.word)}
                <Text style={styles.word}>{w.trailing}</Text>
              </Text>
            </Pressable>
          ))}
        </View>

        {selected ? (
          <View style={styles.detail} testID="stele-detail">
            {selected.known ? (
              <>
                <Text style={styles.detailWord}>{selected.word}</Text>
                <Text style={styles.detailBody}>{brick(selected.brickId).fr.join(', ')}</Text>
              </>
            ) : (
              <Text style={styles.detailBody}>Ce mot t&apos;échappe encore. Une brique te manque.</Text>
            )}
          </View>
        ) : null}

        {complete ? (
          <View style={styles.block} testID="stele-translation">
            <Text style={styles.heading}>Tu peux tout lire</Text>
            <Text style={styles.translation}>{tier.stele.fr}</Text>
          </View>
        ) : null}

        {bossBeaten ? (
          <QuietButton label={reading ? 'Anna lit…' : 'Écouter Anna'} testID="stele-listen" disabled={reading} onPress={readAloud} />
        ) : complete ? (
          <Text style={styles.count}>Sa voix t&apos;attend derrière la Porte.</Text>
        ) : null}
        <QuietButton label="Retour" testID="to-map" onPress={goToMap} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 22, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  count: { color: colors.inkQuiet, fontSize: 14 },
  stone: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderWidth: 1, borderColor: colors.stoneEdge, borderRadius: 10, padding: 16, backgroundColor: colors.brick },
  word: { color: colors.ink, fontSize: 19, lineHeight: 28 },
  rune: { color: colors.inkQuiet, letterSpacing: 1 },
  detail: { borderWidth: 1, borderColor: colors.gold, borderRadius: 10, padding: 14, gap: 4 },
  detailWord: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  detailBody: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  block: { gap: 6, borderTopWidth: 1, borderTopColor: colors.stoneEdge, paddingTop: 14 },
  heading: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  translation: { color: colors.ink, fontSize: 15, fontStyle: 'italic', lineHeight: 23 },
});
