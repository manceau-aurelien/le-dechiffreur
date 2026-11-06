import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lessonContent as content, bricks, tier } from '../../content';
import { isComeback, needsOnboarding, nextObjective, steleProgress, steleWords, toRunes } from '../../core/progress/collections';
import { bricksLearned, cardList } from '../../core/progress/progress';
import { computeSocle, SOCLE_FOR_NEW_NODE, WEAR_LABEL, wearCounts, type Wear } from '../../core/srs/memory';
import { useProgress } from '../../data/ProgressContext';
import { PrimaryButton, QuietButton } from '../../ui/components';
import { colors, MAX_WIDTH } from '../../ui/theme';

const WEAR_ORDER: Wear[] = ['neuve', 'patinee', 'fissuree', 'effritee'];
const STELE_PREVIEW_WORDS = 7;
const percent = (x: number) => `${Math.round(x * 100)} %`;

/** Le Camp : un seul grand bouton, et de quoi voir où l'on en est. */
export default function CampScreen() {
  const { progress, engine, loaded, error, now } = useProgress();

  if (error) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content} testID="load-error">
          <Text style={styles.title}>Progression illisible</Text>
          <Text style={styles.quiet}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!loaded || !engine) return <View style={styles.screen} />;
  if (needsOnboarding(progress)) return <Redirect href="/bienvenue" />;

  const t = now();
  const cards = cardList(progress);
  const socle = computeSocle(cards, engine, t);
  const wear = wearCounts(cards, engine, t);
  const words = steleWords(tier.stele.en, bricks, progress);
  const stele = steleProgress(words);
  const total = bricks.filter((b) => b.tracked).length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <View>
            <Text style={styles.quiet}>{`Palier ${tier.order}`}</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {tier.title}
            </Text>
          </View>
          <Pressable accessibilityRole="button" testID="to-settings" onPress={() => router.push('/reglages')}>
            <Text style={styles.link}>Réglages</Text>
          </Pressable>
        </View>

        {isComeback(progress, t) ? <Text style={styles.anna} testID="comeback">« {tier.texts.comeback} »</Text> : null}

        <PrimaryButton label="Partir 5 minutes" testID="expedition" onPress={() => router.push('/expedition')} />
        <Text style={styles.objective} testID="objective">{nextObjective(content, progress, engine, t)}</Text>

        {progress.bossOpened || progress.devUnlockAll ? (
          <QuietButton label="Aller à la Porte" testID="to-door" onPress={() => router.push('/antichambre')} />
        ) : null}

        <View style={styles.block}>
          <View style={styles.row}>
            <Text style={styles.heading}>Socle</Text>
            <Text style={styles.value} testID="socle-value">{percent(socle)}</Text>
          </View>
          <View style={styles.bar} accessibilityRole="progressbar" accessibilityLabel={`Socle ${percent(socle)}`}>
            <View style={[styles.barFill, { width: percent(socle) as `${number}%`, backgroundColor: socle >= SOCLE_FOR_NEW_NODE ? colors.good : colors.flame }]} />
          </View>
          <Text style={styles.quiet} testID="bricks-count">{`${bricksLearned(progress)} briques sur ${total}`}</Text>
          {cards.length ? (
            <Text style={styles.quiet} testID="wear-counts">
              {WEAR_ORDER.filter((w) => wear[w]).map((w) => `${wear[w]} ${WEAR_LABEL[w]}`).join(' · ')}
            </Text>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" testID="to-stele" onPress={() => router.push('/stele')} style={({ pressed }) => [styles.block, pressed && styles.pressed]}>
          <View style={styles.row}>
            <Text style={styles.heading}>La Stèle</Text>
            <Text style={styles.value} testID="stele-count">{`${stele.known} mots sur ${stele.total}`}</Text>
          </View>
          <Text style={styles.stele}>
            {words.slice(0, STELE_PREVIEW_WORDS).map((w) => `${w.known ? w.word : toRunes(w.word)}${w.trailing}`).join(' ')} …
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 22, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  quiet: { color: colors.inkQuiet, fontSize: 14 },
  link: { color: colors.inkQuiet, fontSize: 14, textDecorationLine: 'underline', paddingTop: 4 },
  anna: { color: colors.ink, fontSize: 17, fontStyle: 'italic', lineHeight: 25 },
  objective: { color: colors.gold, fontSize: 15, lineHeight: 21 },
  block: { gap: 8, borderTopWidth: 1, borderTopColor: colors.stoneEdge, paddingTop: 14 },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heading: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  value: { color: colors.ink, fontSize: 15 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.flameOut, overflow: 'hidden' },
  barFill: { height: 8 },
  stele: { color: colors.ink, fontSize: 16, lineHeight: 24 },
});
