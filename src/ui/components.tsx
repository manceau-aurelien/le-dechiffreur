import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors } from './theme';

export function PrimaryButton(props: { label: string; onPress: () => void; disabled?: boolean; testID?: string; style?: ViewStyle }) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={props.testID}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.primary, props.disabled && styles.disabled, pressed && styles.pressed, props.style]}
    >
      <Text style={[styles.primaryText, props.disabled && styles.disabledText]}>{props.label}</Text>
    </Pressable>
  );
}

export function QuietButton(props: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={props.testID}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.quiet, props.disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.quietText, props.disabled && styles.disabledText]}>{props.label}</Text>
    </Pressable>
  );
}

export function BrickTile(props: {
  label: string;
  meaning?: string;
  onPress?: () => void;
  ghost?: boolean;
  testID?: string;
}) {
  if (props.ghost) {
    return (
      <View style={[styles.brick, styles.ghost]} accessibilityElementsHidden>
        <Text style={[styles.brickText, styles.ghostText]}>{props.label}</Text>
        {props.meaning ? <Text style={[styles.meaning, styles.ghostText]}>{props.meaning}</Text> : null}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      testID={props.testID}
      onPress={props.onPress}
      style={({ pressed }) => [styles.brick, pressed && styles.brickPressed]}
    >
      <Text style={styles.brickText}>{props.label}</Text>
      {props.meaning ? <Text style={styles.meaning}>{props.meaning}</Text> : null}
    </Pressable>
  );
}

export function Flames({ left, total }: { left: number; total: number }) {
  return (
    <View style={styles.flames} accessibilityLabel={`${left} flammes sur ${total}`} accessibilityRole="image">
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.flame, { backgroundColor: i < left ? colors.flame : colors.flameOut }]} />
      ))}
    </View>
  );
}

/** Le masque du Gardien : une forme sombre dont seule la fente s'illumine quand il parle. */
export function GuardianMask({ speaking, extinct }: { speaking: boolean; extinct?: boolean }) {
  return (
    <View style={styles.mask} accessibilityRole="image" accessibilityLabel={speaking ? 'Le Gardien parle' : 'Le Gardien se tait'}>
      <View style={styles.eyes}>
        <View style={[styles.eye, !extinct && styles.eyeLit]} />
        <View style={[styles.eye, !extinct && styles.eyeLit]} />
      </View>
      <View style={[styles.slit, speaking && styles.slitLit]} />
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  primaryText: { color: '#17161b', fontSize: 17, fontWeight: '700' },
  quiet: {
    borderWidth: 1,
    borderColor: colors.brickEdge,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  quietText: { color: colors.ink, fontSize: 15 },
  disabled: { opacity: 0.4 },
  disabledText: {},
  pressed: { opacity: 0.75 },
  brick: {
    backgroundColor: colors.brick,
    borderColor: colors.brickEdge,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 48,
  },
  brickPressed: { backgroundColor: '#3f3c45' },
  brickText: { color: colors.ink, fontSize: 18 },
  meaning: { color: colors.inkQuiet, fontSize: 11, marginTop: 2 },
  ghost: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#3a3840' },
  ghostText: { color: 'transparent' },
  flames: { flexDirection: 'row', gap: 10 },
  flame: { width: 12, height: 20, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  mask: {
    alignSelf: 'center',
    width: 110,
    height: 140,
    borderRadius: 55,
    backgroundColor: '#0d0c10',
    borderWidth: 1,
    borderColor: '#34323a',
    alignItems: 'center',
    paddingTop: 42,
  },
  eyes: { flexDirection: 'row', gap: 24 },
  eye: { width: 18, height: 6, borderRadius: 3, backgroundColor: '#1e1d23' },
  eyeLit: { backgroundColor: '#5c5647' },
  slit: { marginTop: 34, width: 44, height: 5, borderRadius: 3, backgroundColor: '#25232a' },
  slitLit: { backgroundColor: colors.slit, height: 7 },
});
