import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../../audio/AudioService';
import { lessonContent as content, sayClip } from '../../content';
import { exampleFor, wallGroups, wornBricks, type WallBrick } from '../../core/progress/collections';
import type { Wear } from '../../core/srs/memory';
import { useProgress } from '../../data/ProgressContext';
import { PrimaryButton, QuietButton } from '../../ui/components';
import { colors, MAX_WIDTH } from '../../ui/theme';
import { WallBrickView } from '../../ui/WallBrickView';

const WEAR_MEANING: Record<Wear, string> = {
  neuve: 'Neuve : bien ancrée.',
  patinee: 'Patinée : à réviser bientôt.',
  fissuree: 'Fissurée : prioritaire.',
  effritee: 'Effritée : oubli probable, mais elle reste à toi.',
};

/** Le Mur : toutes les briques, leur état d'usure, leur son. */
export default function WallScreen() {
  const { progress, engine, loaded, now } = useProgress();
  const [onlyWorn, setOnlyWorn] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  if (!loaded || !engine) return <View style={styles.screen} />;

  const groups = wallGroups(content, progress, engine, now());
  const worn = wornBricks(groups);
  const acquired = groups.flatMap((g) => g.bricks).filter((b) => b.acquired).length;
  const total = groups.flatMap((g) => g.bricks).length;
  const all = groups.flatMap((g) => g.bricks);
  const current = all.find((b) => b.brick.id === selected);

  const touch = (b: WallBrick) => {
    setSelected(b.brick.id);
    if (b.acquired) audio.play(sayClip('voiceA', b.brick.en));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Le Mur
        </Text>
        <Text style={styles.count} testID="wall-count">{`${acquired} briques sur ${total}`}</Text>

        <View style={styles.filters}>
          <QuietButton label={onlyWorn ? 'Montrer toutes les briques' : `À entretenir (${worn.length})`} testID="filter-worn" onPress={() => setOnlyWorn((v) => !v)} />
        </View>
        {worn.length ? (
          <PrimaryButton
            label="Restaurer les briques usées"
            testID="restore"
            onPress={() => router.push({ pathname: '/expedition', params: { elements: worn.slice(0, 15).map((b) => b.brick.id).join(',') } })}
          />
        ) : null}

        {current ? <BrickDetail brick={current} /> : null}

        {groups.map((group) => {
          const shown = onlyWorn ? group.bricks.filter((b) => b.acquired && b.wear !== 'neuve') : group.bricks;
          if (!shown.length) return null;
          return (
            <View key={group.node.id} style={styles.group} testID={`wall-${group.node.id}`}>
              <Text style={styles.groupTitle}>{group.node.title}</Text>
              <View style={styles.bricks}>
                {shown.map((b) => (
                  <WallBrickView key={b.brick.id} label={b.brick.en} wear={b.wear} selected={selected === b.brick.id} testID={`wall-${b.brick.id}`} onPress={() => touch(b)} />
                ))}
              </View>
            </View>
          );
        })}
        {onlyWorn && !worn.length ? <Text style={styles.count}>Rien à entretenir pour l&apos;instant.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function BrickDetail({ brick: b }: { brick: WallBrick }) {
  const { progress } = useProgress();
  if (!b.acquired) {
    return (
      <View style={styles.detail} testID="brick-detail">
        <Text style={styles.detailBody}>Une brique encore inconnue. Continue ton chemin sur la Carte.</Text>
      </View>
    );
  }
  const example = exampleFor(b.brick.id, content, progress);
  return (
    <View style={styles.detail} testID="brick-detail">
      <Text style={styles.detailWord}>{b.brick.en}</Text>
      <Text style={styles.detailBody}>{b.brick.fr.join(', ')}</Text>
      {b.wear ? <Text style={styles.detailWear}>{WEAR_MEANING[b.wear]}</Text> : null}
      {b.brick.note ? <Text style={styles.detailNote}>{b.brick.note}</Text> : null}
      {example ? <Text style={styles.detailBody} testID="brick-example">{`${example.en} ${example.fr}`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 22, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  count: { color: colors.inkQuiet, fontSize: 14 },
  filters: { flexDirection: 'row' },
  group: { gap: 8, borderTopWidth: 1, borderTopColor: colors.stoneEdge, paddingTop: 12 },
  groupTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  bricks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detail: { borderWidth: 1, borderColor: colors.gold, borderRadius: 10, padding: 14, gap: 4 },
  detailWord: { color: colors.ink, fontSize: 24, fontWeight: '700' },
  detailBody: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  detailWear: { color: colors.inkQuiet, fontSize: 14 },
  detailNote: { color: colors.gold, fontSize: 14, lineHeight: 20 },
});
