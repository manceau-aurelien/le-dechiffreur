import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../audio/AudioService';
import { boss, brick, sayClip, tier } from '../content';
import { allNodesDone, cardList, nodeStatus } from '../core/progress/progress';
import { bossLock, doorAdvice, SOCLE_FOR_BOSS } from '../core/srs/memory';
import { useProgress } from '../data/ProgressContext';
import { goToMap } from '../ui/lesson/LessonRun';
import { repository } from '../data/repository';
import { bossMemory, useBossSession } from '../ui/BossSession';
import { BrickTile, PrimaryButton, QuietButton } from '../ui/components';
import { colors, MAX_WIDTH } from '../ui/theme';

/** L'Antichambre : les règles, le test du son, puis l'entrée dans l'antre. */
export default function Anteroom() {
  const { settings, setSettings } = useBossSession();
  const { progress, engine, loaded, now } = useProgress();
  const [heard, setHeard] = useState(false);
  const [played, setPlayed] = useState(false);
  const testBrick = brick(tier.soundTestBrickId);
  const [resumeRank, setResumeRank] = useState<number | null>(null);

  useEffect(() => {
    repository.bossSummary(boss.id).then((summary) => {
      bossMemory.lastDrawn = summary.lastDrawn;
      bossMemory.hasEntered = summary.attempts > 0;
      bossMemory.defeatsInARow = summary.defeatsInARow;
      bossMemory.resume = summary.resumable;
      setResumeRank(summary.resumable ? summary.resumable.state.rounds[summary.resumable.state.index].rank : null);
    });
  }, []);

  const startFresh = async () => {
    // Un combat laissé en suspens ne compte ni comme victoire ni comme défaite.
    if (bossMemory.resume) {
      const { attemptId, state } = bossMemory.resume;
      await repository.saveBossAttempt(attemptId, boss.id, { ...state, stage: 'abandoned' }, Date.now(), Date.now());
      bossMemory.resume = null;
    }
    router.replace('/antre');
  };

  if (!loaded || !engine) return <View style={styles.screen} />;
  const bossNode = tier.nodes[tier.nodes.length - 1];
  if (nodeStatus(tier, progress, bossNode) === 'locked') {
    const lock = bossLock(cardList(progress), allNodesDone(tier, progress), engine, now());
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>{`Palier ${tier.order} · ${tier.title}`}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            La Porte est fermée
          </Text>
          <Text style={styles.advice} testID="door-advice">{doorAdvice(lock)}</Text>
          <View style={styles.block}>
            <Text style={styles.heading}>Pour affronter le Gardien</Text>
            <Condition done={lock.nodesDone} testID="door-nodes" label="Terminer les 12 nœuds de la carte" />
            <Condition
              done={lock.socle >= SOCLE_FOR_BOSS}
              testID="door-socle"
              label={`Garder un socle d'au moins ${Math.round(SOCLE_FOR_BOSS * 100)} %`}
              detail={`Le tien : ${Math.round(lock.socle * 100)} %`}
            />
          </View>
          <PrimaryButton label="Partir 5 minutes" testID="door-expedition" onPress={() => router.push('/expedition')} />
          <QuietButton label="Retour" testID="to-map" onPress={goToMap} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const playTest = async () => {
    await audio.play(sayClip('voiceA', testBrick.en));
    setPlayed(true);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{`Palier ${tier.order} · ${tier.title}`}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {boss.title}
        </Text>
        <Text style={styles.anna}>« {tier.texts.anteroom} »</Text>
        <Text style={styles.signature}>Anna</Text>

        <View style={styles.block}>
          <Text style={styles.heading}>Les règles</Text>
          <Text style={styles.rule}>· 10 phrases, de la plus simple à la plus longue, environ 5 minutes.</Text>
          <Text style={styles.rule}>· 3 flammes : la quatrième erreur met fin au combat.</Text>
          <Text style={styles.rule}>· Tu reconstruis ce que tu entends, puis tu prouves que tu as compris.</Text>
          <Text style={styles.rule}>· Tu peux faire répéter 2 fois par phrase, et ralentir 3 fois par combat.</Text>
          <Text style={styles.rule}>· Pas de chrono. Si tu perds, tu reprends au rang 1, avec d&apos;autres phrases.</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.heading}>Test du son</Text>
          <Text style={styles.rule}>Touche la brique. Un casque est conseillé.</Text>
          <View style={styles.soundRow}>
            <BrickTile label={testBrick.en} testID="sound-test-brick" onPress={playTest} />
            <QuietButton label="Je l'ai entendue" disabled={!played} testID="sound-confirm" onPress={() => setHeard(true)} />
          </View>
          {heard ? <Text style={styles.ok}>Son vérifié. Là-dedans, plus aucune brique ne sonnera.</Text> : null}
        </View>

        <View style={styles.block}>
          <Text style={styles.heading}>Réglages de test</Text>
          <Setting
            label="Afficher le sens sous les briques"
            hint="Pour jouer sans avoir suivi toutes les leçons."
            value={settings.showMeanings}
            testID="setting-meanings"
            onChange={(showMeanings) => setSettings({ ...settings, showMeanings })}
          />
          <Setting
            label="Oreille coupée"
            hint="Joue sans la voix : tu ne devrais presque jamais gagner."
            value={settings.muted}
            testID="setting-muted"
            onChange={(muted) => setSettings({ ...settings, muted })}
          />
          <Setting
            label="Vibration au placement"
            value={settings.haptics}
            testID="setting-haptics"
            onChange={(haptics) => setSettings({ ...settings, haptics })}
          />
        </View>

        <PrimaryButton
          label="Entrer"
          testID="enter-lair"
          disabled={!heard && !settings.muted}
          onPress={startFresh}
        />
        {resumeRank !== null ? (
          <QuietButton
            label={`Reprendre le combat (rang ${resumeRank})`}
            testID="resume-combat"
            disabled={!heard && !settings.muted}
            onPress={() => router.replace('/antre?resume=1')}
          />
        ) : null}
        <QuietButton label="Se préparer d'abord" testID="prepare-first" onPress={() => router.push('/expedition')} />
        <QuietButton label="Retour" testID="to-map" onPress={goToMap} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Condition(props: { done: boolean; label: string; detail?: string; testID: string }) {
  return (
    <View style={styles.condition} testID={props.testID}>
      <Text style={[styles.mark, { color: props.done ? colors.good : colors.flame }]}>{props.done ? 'Fait' : 'À faire'}</Text>
      <View style={styles.settingText}>
        <Text style={styles.rule}>{props.label}</Text>
        {props.detail ? <Text style={styles.hint}>{props.detail}</Text> : null}
      </View>
    </View>
  );
}

function Setting(props: { label: string; hint?: string; value: boolean; testID: string; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.setting}>
      <View style={styles.settingText}>
        <Text style={styles.rule}>{props.label}</Text>
        {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
      </View>
      <Switch testID={props.testID} accessibilityLabel={props.label} value={props.value} onValueChange={props.onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 24, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  kicker: { color: colors.inkQuiet, fontSize: 14 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  anna: { color: colors.ink, fontSize: 17, fontStyle: 'italic', lineHeight: 25, marginTop: 8 },
  signature: { color: colors.inkQuiet, fontSize: 14, alignSelf: 'flex-end' },
  block: { borderTopWidth: 1, borderTopColor: colors.stoneEdge, paddingTop: 14, gap: 8 },
  heading: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  rule: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  hint: { color: colors.inkQuiet, fontSize: 13, lineHeight: 18 },
  ok: { color: colors.good, fontSize: 14 },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  advice: { color: colors.gold, fontSize: 17, lineHeight: 25 },
  condition: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  mark: { fontSize: 13, fontWeight: '700', width: 46, marginTop: 3 },
  settingText: { flex: 1 },
});
