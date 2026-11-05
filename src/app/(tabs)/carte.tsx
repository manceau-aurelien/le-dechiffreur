import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tier } from '../../content';
import type { TierNode } from '../../content/schema';
import { allNodesDone, cardList, nodeStatus, type NodeStatus } from '../../core/progress/progress';
import { canStartNew } from '../../core/session/expedition';
import { bossLock } from '../../core/srs/memory';
import { useProgress } from '../../data/ProgressContext';
import { colors, MAX_WIDTH } from '../../ui/theme';

const STATUS_LABEL: Record<NodeStatus, string> = {
  locked: 'Verrouillé',
  available: 'Disponible',
  in_progress: 'En cours',
  completed: 'Terminé',
};
const KIND_LABEL: Record<TierNode['kind'], string> = { vein: 'Filon', formula: 'Formule', boss: 'Boss' };
const percent = (x: number) => `${Math.round(x * 100)} %`;

/** Le chemin des 13 nœuds. La Porte est visible dès le début (§2.5). */
export default function MapScreen() {
  const { progress, engine, loaded, now } = useProgress();
  const [notice, setNotice] = useState<string | null>(null);

  if (!loaded || !engine) return <View style={styles.screen} />;

  const t = now();
  const canLearn = canStartNew({ progress, engine, now: t });
  const lock = bossLock(cardList(progress), allNodesDone(tier, progress), engine, t);

  const open = (node: TierNode) => {
    if (node.kind === 'boss') {
      router.push('/antichambre');
      return;
    }
    if (nodeStatus(tier, progress, node) !== 'completed' && !canLearn) {
      setNotice('Tes briques ont besoin d’entretien avant d’en poser d’autres. Pars 5 minutes depuis le Camp.');
      return;
    }
    setNotice(null);
    router.push({ pathname: '/lecon/[id]', params: { id: node.id } });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{`Palier ${tier.order}`}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          La Carte
        </Text>
        {notice ? <Text style={styles.notice} testID="socle-notice">{notice}</Text> : null}

        <View style={styles.path}>
          {tier.nodes.map((node, i) => {
            const status = nodeStatus(tier, progress, node);
            const locked = status === 'locked';
            return (
              <Pressable
                key={node.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: locked }}
                accessibilityLabel={`${node.title}, ${STATUS_LABEL[status]}`}
                testID={`node-${node.id}`}
                disabled={locked}
                onPress={() => open(node)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.dot,
                      status === 'completed' && styles.dotDone,
                      (status === 'available' || status === 'in_progress') && styles.dotOpen,
                    ]}
                  />
                  {i < tier.nodes.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={[styles.card, locked && styles.cardLocked, node.kind === 'boss' && styles.cardBoss]}>
                  <Text style={styles.kind}>{KIND_LABEL[node.kind]}</Text>
                  <Text style={[styles.nodeTitle, locked && styles.textLocked]}>{node.title}</Text>
                  <Text style={[styles.status, status === 'completed' && styles.statusDone]}>{STATUS_LABEL[status]}</Text>
                  {node.kind === 'boss' && locked ? (
                    <Text style={styles.lockInfo} testID="boss-lock">
                      {`${lock.nodesDone ? '12 nœuds terminés' : 'Termine les 12 nœuds'} · socle ${percent(lock.socle)} sur 80 % · consolidés ${percent(lock.consolidated)} sur 80 %`}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 22, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  kicker: { color: colors.inkQuiet, fontSize: 14 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', marginBottom: 14 },
  notice: { color: colors.gold, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  path: {},
  row: { flexDirection: 'row', gap: 12 },
  pressed: { opacity: 0.75 },
  rail: { width: 18, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 20, backgroundColor: colors.flameOut },
  dotOpen: { backgroundColor: colors.flame },
  dotDone: { backgroundColor: colors.good },
  line: { flex: 1, width: 2, backgroundColor: colors.stoneEdge },
  card: {
    flex: 1,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.stoneEdge,
    backgroundColor: colors.brick,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cardLocked: { backgroundColor: 'transparent' },
  cardBoss: { borderColor: colors.flame },
  kind: { color: colors.inkQuiet, fontSize: 12 },
  nodeTitle: { color: colors.ink, fontSize: 17, fontWeight: '600', marginVertical: 2 },
  textLocked: { color: colors.inkQuiet },
  status: { color: colors.inkQuiet, fontSize: 13 },
  statusDone: { color: colors.good },
  lockInfo: { color: colors.inkQuiet, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
