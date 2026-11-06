import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { city, lessonContent as content } from '../../content';
import type { TierNode } from '../../content/schema';
import { composeLesson } from '../../core/exercise/lesson';
import { canEnter, districtEntry } from '../../core/progress/city';
import { nodeStatus } from '../../core/progress/progress';
import { canStartNew } from '../../core/session/expedition';
import type { SrsEngine } from '../../core/srs/types';
import { useProgress } from '../../data/ProgressContext';
import { LessonRun } from '../../ui/lesson/LessonRun';
import { colors } from '../../ui/theme';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { progress, engine, loaded, now } = useProgress();
  const node = content.tier.nodes.find((n) => n.id === id);
  if (!loaded || !engine) return <View style={{ flex: 1, backgroundColor: colors.stoneLight }} />;
  if (!node || node.kind === 'boss') return <Redirect href="/" />;
  const district = city.districts.find((d) => d.id === node.districtId);
  if (district && !canEnter(districtEntry(district, content, progress, engine, now()))) {
    return <Redirect href={{ pathname: '/quartier/[id]', params: { id: district.id } }} />;
  }
  const status = nodeStatus(content.tier, progress, node);
  // Rien de ce qui est acquis ne se referme : seul le contenu neuf dépend du socle (§2.4).
  const blocked = status !== 'completed' && !canStartNew({ progress, engine, now: now() });
  if (status === 'locked' || blocked) return <Redirect href="/" />;
  return <Lesson key={node.id} node={node} engine={engine} />;
}

function Lesson({ node, engine }: { node: TierNode; engine: SrsEngine }) {
  const { progress } = useProgress();
  const [plan, setPlan] = useState(() => composeLesson(node, content, progress, Math.random));
  const [run, setRun] = useState(0);
  const restart = () => {
    setPlan((last) => composeLesson(node, content, progress, Math.random, last.trialPicked));
    setRun((r) => r + 1);
  };
  return <LessonRun key={run} plan={plan} engine={engine} onRestart={restart} />;
}
