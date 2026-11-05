import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toRunes } from '../core/progress/collections';
import type { Wear } from '../core/srs/memory';
import { colors } from './theme';

interface Props {
  label: string;
  wear: Wear | null; // null : brique pas encore acquise
  selected?: boolean;
  testID?: string;
  onPress: () => void;
}

const WEAR_TEXT: Record<Wear, string> = { neuve: 'neuve', patinee: 'patinée', fissuree: 'fissurée', effritee: 'effritée' };

/** Une brique du Mur. L'usure se voit, mais le mot reste toujours lisible : une brique n'est jamais perdue. */
export function WallBrickView({ label, wear, selected, testID, onPress }: Props) {
  const unknown = wear === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unknown ? 'Brique inconnue' : `${label}, ${WEAR_TEXT[wear]}`}
      testID={testID}
      onPress={onPress}
      style={[styles.brick, wear ? styles[wear] : styles.unknown, selected && styles.selected]}
    >
      {wear === 'neuve' ? <View style={styles.shine} /> : null}
      {wear === 'fissuree' || wear === 'effritee' ? (
        <>
          <View style={[styles.crack, styles.crackA]} />
          <View style={[styles.crack, styles.crackB]} />
        </>
      ) : null}
      {wear === 'effritee' ? (
        <>
          <View style={[styles.chip, styles.chipTop]} />
          <View style={[styles.chip, styles.chipBottom]} />
        </>
      ) : null}
      <Text style={[styles.text, unknown && styles.textUnknown, wear === 'patinee' && styles.textDim]}>{unknown ? toRunes(label) : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brick: { borderWidth: 1, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14, minWidth: 54, alignItems: 'center', overflow: 'hidden' },
  selected: { borderColor: colors.gold, borderWidth: 2 },
  unknown: { backgroundColor: 'transparent', borderColor: colors.stoneEdge, borderStyle: 'dashed' },
  neuve: { backgroundColor: '#45424c', borderColor: '#8f8b98' },
  patinee: { backgroundColor: colors.brick, borderColor: colors.brickEdge },
  fissuree: { backgroundColor: '#2d2b30', borderColor: '#4a4750' },
  effritee: { backgroundColor: '#272528', borderColor: '#413e45', borderStyle: 'dashed' },
  shine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#a8a4b0' },
  crack: { position: 'absolute', width: 1.5, backgroundColor: '#14131a' },
  crackA: { height: 34, top: -4, left: '26%', transform: [{ rotate: '22deg' }] },
  crackB: { height: 26, bottom: -4, right: '20%', transform: [{ rotate: '-30deg' }] },
  chip: { position: 'absolute', width: 12, height: 12, backgroundColor: colors.stoneLight, transform: [{ rotate: '45deg' }] },
  chipTop: { top: -7, right: -7 },
  chipBottom: { bottom: -7, left: -7 },
  text: { color: colors.ink, fontSize: 17 },
  textDim: { color: '#cfcabd' },
  textUnknown: { color: colors.inkQuiet, letterSpacing: 1 },
});
