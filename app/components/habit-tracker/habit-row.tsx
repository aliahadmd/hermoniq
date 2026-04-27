import { Pressable, StyleSheet, View } from 'react-native';
import { Circle, Svg } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitListItem } from '@/lib/types';

export const HABIT_CARD_HORIZONTAL_MARGIN = 10;
export const HABIT_CARD_HORIZONTAL_PADDING = 10;
export const HABIT_INFO_COLUMN_WIDTH = 148;
export const HABIT_INFO_TO_DAYS_GAP = 10;
export const HABIT_DAY_CELL_SIZE = 32;
export const HABIT_DAY_CELL_GAP = 6;

interface HabitRowProps {
  item: HabitListItem;
  dayScrollX: number;
  onPressHabit: (item: HabitListItem) => void;
  onPressTodayDot: (item: HabitListItem) => void;
  onOpenYesNo: (
    item: HabitListItem,
    date: string,
    currentCompleted: boolean,
    currentNote: string,
    hasLog: boolean,
  ) => void;
  onOpenMeasurable: (
    item: HabitListItem,
    date: string,
    currentValue: number | null,
    currentNote: string,
    hasLog: boolean,
  ) => void;
}

function ProgressRing({
  size,
  strokeWidth,
  percent,
  color,
  trackColor,
}: {
  size: number;
  strokeWidth: number;
  percent: number;
  color: string;
  trackColor: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        fill="transparent"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export function HabitRow({
  item,
  dayScrollX,
  onPressHabit,
  onPressTodayDot,
  onOpenYesNo,
  onOpenMeasurable,
}: HabitRowProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const textSecondary = useThemeColor({}, 'textSecondary');

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.row}>
        <View style={styles.habitInfo}>
          <Pressable
            style={styles.progressButton}
            onPress={() => {
              Haptics.selectionAsync();
              onPressTodayDot(item);
            }}
          >
            <ProgressRing
              size={24}
              strokeWidth={4}
              percent={item.progressPercent}
              color={item.color}
              trackColor={borderColor}
            />
          </Pressable>
          <Pressable
            style={styles.habitTextWrap}
            onPress={() => {
              Haptics.selectionAsync();
              onPressHabit(item);
            }}
          >
            <ThemedText type="defaultSemiBold" style={{ color: item.color }}>
              {item.name}
            </ThemedText>
            <ThemedText style={{ color: textSecondary, fontSize: 12 }}>
              {item.completedCount}/{item.scheduledCount} in last {item.dayCells.length} days
            </ThemedText>
            <ThemedText style={{ color: textSecondary, fontSize: 11 }}>
              Tap circle to mark today
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.daysWrap}>
          <View style={[styles.daysRow, { transform: [{ translateX: -dayScrollX }] }]}>
            {item.dayCells.map((cell) => {
              const isYesNo = item.type === 'yes_no';
              return (
                <Pressable
                  key={cell.date}
                  disabled={!cell.scheduled}
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (isYesNo) {
                      onOpenYesNo(item, cell.date, cell.completed, cell.note, cell.hasLog);
                      return;
                    }
                    onOpenMeasurable(item, cell.date, cell.value, cell.note, cell.hasLog);
                  }}
                  style={[
                    styles.dayCell,
                    {
                      borderColor: borderColor,
                      backgroundColor: cell.scheduled ? surface : 'transparent',
                      opacity: cell.scheduled ? 1 : 0.35,
                    },
                    cell.completed && {
                      borderColor: item.color,
                      backgroundColor: `${item.color}1F`,
                    },
                  ]}
                >
                  {!cell.scheduled ? (
                    <ThemedText style={{ color: textSecondary, fontSize: 12 }}>-</ThemedText>
                  ) : isYesNo ? (
                    <View
                      style={[
                        styles.statusDot,
                        {
                          borderColor: cell.completed ? item.color : textSecondary,
                          backgroundColor: cell.completed ? item.color : `${textSecondary}66`,
                        },
                      ]}
                    />
                  ) : (
                    <ThemedText style={{ color: cell.completed ? item.color : textSecondary, fontSize: 12 }}>
                      {cell.value ?? 0}
                    </ThemedText>
                  )}
                  {cell.note.length > 0 ? (
                    <View style={[styles.noteDot, { backgroundColor: item.color }]} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginHorizontal: HABIT_CARD_HORIZONTAL_MARGIN,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: HABIT_CARD_HORIZONTAL_PADDING,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HABIT_INFO_TO_DAYS_GAP,
  },
  habitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: HABIT_INFO_COLUMN_WIDTH,
    flexShrink: 0,
  },
  progressButton: {
    padding: 2,
  },
  habitTextWrap: {
    flex: 1,
  },
  daysWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HABIT_DAY_CELL_GAP,
  },
  dayCell: {
    width: HABIT_DAY_CELL_SIZE,
    height: HABIT_DAY_CELL_SIZE,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  noteDot: {
    position: 'absolute',
    right: 3,
    top: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
