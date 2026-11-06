import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../audio/AudioService';
import { bossClip, brick, steleClip, tier } from '../content';
import type { RoundResult } from '../core/boss/engine';
import { bossMemory, useBossSession } from '../ui/BossSession';
import { goToMap } from '../ui/lesson/LessonRun';
import { GuardianMask, PrimaryButton, QuietButton } from '../ui/components';
import { colors, MAX_WIDTH } from '../ui/theme';

const enterCity = () => {
  goToMap();
  router.navigate('/carte');
};

export default function Debrief() {
  const { lastCombat, settings, lastBlamed } = useBossSession();
  const [readingStele, setReadingStele] = useState(false);
  const won = lastCombat?.stage === 'won';

  // Après la victoire, le premier bruit depuis l'entrée : la pierre, puis la voix d'Anna.
  useEffect(() => {
    if (!won || settings.muted) return;
    let cancelled = false;
    (async () => {
      await audio.play('sfx:door');
      if (cancelled) return;
      setReadingStele(true);
      await audio.play(steleClip(tier.id));
      if (!cancelled) setReadingStele(false);
    })();
    return () => {
      cancelled = true;
      audio.stop();
    };
  }, [won, settings.muted]);

  if (!lastCombat) return <Redirect href="/antichambre" />;

  const flawless = won && lastCombat.errors === 0;

  return (
    <SafeAreaView style={[styles.screen, won ? styles.screenWon : styles.screenLost]}>
      <ScrollView contentContainerStyle={styles.content}>
        {won ? null : <GuardianMask speaking={false} extinct />}
        <Text accessibilityRole="header" style={styles.title} testID="debrief-title">
          {won ? 'La Porte s\'ouvre' : 'Le Gardien se tait'}
        </Text>
        <Text style={styles.anna}>« {won ? tier.texts.victory : tier.texts.defeat} »</Text>
        <Text style={styles.score} testID="debrief-score">
          {`${lastCombat.errors} erreur${lastCombat.errors > 1 ? 's' : ''} · ${lastCombat.results.length} rangs joués sur ${lastCombat.rounds.length}`}
        </Text>
        {flawless ? <Text style={styles.gold}>{"Sans-faute : un sceau d'or orne la porte."}</Text> : null}

        {won ? (
          <View style={styles.stele} testID="stele">
            <Text style={styles.steleTitle}>{readingStele ? 'Anna lit la Stèle…' : 'La Stèle'}</Text>
            <Text style={styles.steleEn}>{tier.stele.en}</Text>
            <Text style={styles.steleFr}>{tier.stele.fr}</Text>
          </View>
        ) : null}

        <Text style={styles.heading}>Ce que le Gardien a dit</Text>
        {lastCombat.results.map((r) => (
          <RoundRow key={r.rank} result={r} />
        ))}

        {!won && bossMemory.defeatsInARow >= 2 && lastBlamed.length ? (
          <>
            <Text style={styles.hint} testID="prep-hint">Deux défaites de suite. Une préparation ciblée peut t&apos;aider, si tu veux.</Text>
            <QuietButton
              label="Préparation ciblée"
              testID="prep"
              onPress={() => {
                audio.stop();
                router.push({ pathname: '/expedition', params: { elements: lastBlamed.join(',') } });
              }}
            />
          </>
        ) : null}

        <PrimaryButton label="Retenter" testID="retry" onPress={() => { audio.stop(); router.replace('/antre'); }} />
        {won ? <PrimaryButton label="Entrer dans la Ville" testID="to-city" onPress={enterCity} /> : null}
        <QuietButton label="Retour au Camp" testID="back" onPress={goToMap} />
      </ScrollView>
    </SafeAreaView>
  );
}

function RoundRow({ result }: { result: RoundResult }) {
  const { variant, outcome } = result;
  const ok = outcome === 'ok';
  const options = variant.riposte?.options;
  const chosen = result.riposteChoice !== null ? options?.[result.riposteChoice] : undefined;
  const expected = options?.find((o) => o.correct);

  return (
    <View style={styles.row} testID={`debrief-rank-${result.rank}`}>
      <View style={styles.rowHead}>
        <Text style={[styles.mark, { color: ok ? colors.good : colors.bad }]}>{`Rang ${result.rank} · ${ok ? 'réussi' : 'perdu'}`}</Text>
        <QuietButton label="Écouter" testID={`listen-${result.rank}`} onPress={() => audio.play(bossClip(variant.id))} />
      </View>
      <Text style={styles.phrase}>{variant.audio}</Text>
      <Text style={styles.fr}>{variant.fr}</Text>
      {outcome === 'sequence' ? (
        <Text style={styles.detail}>Tu as scellé : {result.placed.map((id) => brick(id).en).join(' ')}</Text>
      ) : null}
      {outcome === 'riposte' && chosen && expected ? (
        <>
          <Text style={styles.detail}>Question : {variant.riposte?.question}</Text>
          <Text style={styles.detail}>Ta réponse : {chosen.text}</Text>
          <Text style={styles.detail}>Bonne réponse : {expected.text}</Text>
        </>
      ) : null}
      {!ok ? <Text style={styles.retain}>À retenir : {variant.aRetenir}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenWon: { backgroundColor: colors.stoneLight },
  screenLost: { backgroundColor: '#0d0c10' },
  content: { padding: 22, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  anna: { color: colors.ink, fontSize: 16, fontStyle: 'italic', lineHeight: 24, textAlign: 'center' },
  score: { color: colors.inkQuiet, fontSize: 14, textAlign: 'center' },
  gold: { color: colors.gold, fontSize: 15, textAlign: 'center' },
  stele: { borderWidth: 1, borderColor: colors.stoneEdge, borderRadius: 10, padding: 16, gap: 10 },
  steleTitle: { color: colors.inkQuiet, fontSize: 14 },
  steleEn: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  steleFr: { color: colors.inkQuiet, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 8 },
  row: { borderTopWidth: 1, borderTopColor: '#3a3840', paddingTop: 12, gap: 4 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mark: { fontSize: 14, fontWeight: '600' },
  phrase: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  fr: { color: colors.ink, fontSize: 15 },
  detail: { color: colors.inkQuiet, fontSize: 14 },
  retain: { color: colors.gold, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.inkQuiet, fontSize: 14, lineHeight: 20 },
});
