import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from 'react-native';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

dayjs.extend(customParseFormat);

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const INITIAL_PADDING_ROWS = 2;

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const PERIODS = ['AM', 'PM'] as const;

interface ReminderTimePickerFieldProps {
  value: string | null;
  onChange: (time: string) => void;
}

interface TimeParts {
  hourIndex: number;
  minuteIndex: number;
  periodIndex: number;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

function parseToTimeParts(value: string | null): TimeParts {
  const parsed = value ? dayjs(value, 'HH:mm', true) : dayjs().minute(0);
  const valid = parsed.isValid() ? parsed : dayjs().minute(0);
  const hour24 = valid.hour();
  const hour12 = hour24 % 12 || 12;
  const periodIndex = hour24 >= 12 ? 1 : 0;

  return {
    hourIndex: hour12 - 1,
    minuteIndex: valid.minute(),
    periodIndex,
  };
}

function buildTimeValue(parts: TimeParts): string {
  const hour12 = parts.hourIndex + 1;
  const minute = parts.minuteIndex;
  const period = PERIODS[parts.periodIndex] ?? 'AM';
  const hour24 = period === 'AM' ? hour12 % 12 : (hour12 % 12) + 12;

  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatTimeLabel(value: string | null): string {
  if (!value) return 'Pick reminder time';
  const parsed = dayjs(value, 'HH:mm', true);
  if (!parsed.isValid()) return 'Pick reminder time';
  return parsed.format('h:mm A');
}

interface WheelColumnProps {
  values: readonly string[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

function WheelColumn({ values, selectedIndex, onSelectIndex }: WheelColumnProps) {
  const textSecondary = useThemeColor({}, 'textSecondary');
  const text = useThemeColor({}, 'text');
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    listRef.current?.scrollToOffset({
      offset: selectedIndex * ITEM_HEIGHT,
      animated: false,
    });
  }, [selectedIndex]);

  const snapToIndex = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
    withHaptic: boolean,
  ) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const nextIndex = clampIndex(rawIndex, values.length);

    listRef.current?.scrollToOffset({
      offset: nextIndex * ITEM_HEIGHT,
      animated: true,
    });

    if (nextIndex === selectedIndex) return;
    if (withHaptic) Haptics.selectionAsync();
    onSelectIndex(nextIndex);
  };

  return (
    <View style={styles.column}>
      <FlatList
        ref={listRef}
        data={values as string[]}
        keyExtractor={(item) => item}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        contentContainerStyle={{
          paddingVertical: INITIAL_PADDING_ROWS * ITEM_HEIGHT,
        }}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        onMomentumScrollEnd={(event) => snapToIndex(event, true)}
        onScrollEndDrag={(event) => snapToIndex(event, false)}
        renderItem={({ item, index }) => {
          const isSelected = index === selectedIndex;
          return (
            <View style={styles.item}>
              <ThemedText
                style={[
                  styles.itemText,
                  { color: isSelected ? text : textSecondary },
                ]}
              >
                {item}
              </ThemedText>
            </View>
          );
        }}
      />
    </View>
  );
}

export function ReminderTimePickerField({ value, onChange }: ReminderTimePickerFieldProps) {
  const borderColor = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'card');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const [isOpen, setIsOpen] = useState(false);
  const [parts, setParts] = useState<TimeParts>(() => parseToTimeParts(value));

  useEffect(() => {
    if (isOpen) return;
    setParts(parseToTimeParts(value));
  }, [isOpen, value]);

  const previewLabel = useMemo(() => formatTimeLabel(value), [value]);
  const previewSelection = useMemo(() => formatTimeLabel(buildTimeValue(parts)), [parts]);

  const open = () => {
    Haptics.selectionAsync();
    setParts(parseToTimeParts(value));
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
  };

  const apply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onChange(buildTimeValue(parts));
    close();
  };

  return (
    <>
      <Pressable onPress={open} style={[styles.fieldButton, { borderColor, backgroundColor: surface }]}>
        <View style={styles.fieldTextWrap}>
          <ThemedText style={{ color: text }}>{previewLabel}</ThemedText>
          <ThemedText style={[styles.fieldHint, { color: textSecondary }]}>
            Tap to set with scroll clock
          </ThemedText>
        </View>
        <Ionicons name="time-outline" size={20} color={tint} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.headerRow}>
              <ThemedText type="subtitle">Reminder Time</ThemedText>
              <ThemedText style={{ color: textSecondary }}>{previewSelection}</ThemedText>
            </View>

            <View style={[styles.wheelWrap, { borderColor }]}>
              <View pointerEvents="none" style={[styles.selectionWindow, { borderColor }]} />
              <WheelColumn
                values={HOURS}
                selectedIndex={parts.hourIndex}
                onSelectIndex={(nextHour) =>
                  setParts((prev) => ({
                    ...prev,
                    hourIndex: nextHour,
                  }))
                }
              />
              <WheelColumn
                values={MINUTES}
                selectedIndex={parts.minuteIndex}
                onSelectIndex={(nextMinute) =>
                  setParts((prev) => ({
                    ...prev,
                    minuteIndex: nextMinute,
                  }))
                }
              />
              <WheelColumn
                values={PERIODS}
                selectedIndex={parts.periodIndex}
                onSelectIndex={(nextPeriod) =>
                  setParts((prev) => ({
                    ...prev,
                    periodIndex: nextPeriod,
                  }))
                }
              />
            </View>

            <View style={styles.actions}>
              <Pressable onPress={close} style={[styles.button, { borderColor }]}>
                <ThemedText style={{ color: textSecondary }}>Cancel</ThemedText>
              </Pressable>
              <Pressable onPress={apply} style={[styles.button, styles.primaryButton, { backgroundColor: tint }]}>
                <ThemedText style={styles.primaryButtonText}>Apply</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldTextWrap: {
    flex: 1,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wheelWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    overflow: 'hidden',
    position: 'relative',
  },
  selectionWindow: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: ITEM_HEIGHT * INITIAL_PADDING_ROWS,
    height: ITEM_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  column: {
    flex: 1,
    height: ITEM_HEIGHT * VISIBLE_ROWS,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 20,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButton: {
    borderWidth: 0,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
