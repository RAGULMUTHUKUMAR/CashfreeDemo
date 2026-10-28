import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  ink: '#17211b',
  muted: '#647067',
  paper: '#f2f5ee',
  white: '#ffffff',
  lime: '#c7f36b',
  line: '#dce3d6',
  green: '#28633d',
  amber: '#8b5a16',
  red: '#a43d35',
};

export function ScreenFrame({ children, dark = false }) {
  return (
    <SafeAreaView style={[styles.safeArea, dark && styles.darkSafeArea]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
  busy = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        pressed && !disabled && styles.pressedButton,
        (disabled || busy) && styles.disabledButton,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.ink : colors.ink} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  autoCapitalize = 'none',
  maxLength,
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8b948b"
        style={[styles.input, error && styles.inputError]}
        value={value}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function StatusBadge({ status, label }) {
  const tone =
    status === 'SUCCESS' || status === 'online'
      ? 'green'
      : status === 'FAILED' || status === 'UNVERIFIABLE' || status === 'offline'
      ? 'red'
      : status === 'VERIFYING' ||
        status === 'PENDING' ||
        status === 'EXPIRED' ||
        status === 'checking'
      ? 'amber'
      : 'neutral';
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>
        {label || status || 'UNKNOWN'}
      </Text>
    </View>
  );
}

export function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function formatRupees(amount) {
  const value = Number(amount);
  return Number.isFinite(value)
    ? `Rs ${value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : 'Rs --';
}

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString();
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  darkSafeArea: { backgroundColor: colors.ink },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 36,
  },
  button: {
    minHeight: 54,
    borderRadius: 6,
    paddingHorizontal: 18,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressedButton: { opacity: 0.78 },
  disabledButton: { opacity: 0.55 },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 5,
    backgroundColor: colors.white,
    color: colors.ink,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  inputError: { borderColor: colors.red },
  errorText: { color: colors.red, fontSize: 12, marginTop: 5 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  badge_green: { backgroundColor: '#e1f1dc' },
  badge_amber: { backgroundColor: '#f8ebd3' },
  badge_red: { backgroundColor: '#f5e1dd' },
  badge_neutral: { backgroundColor: '#e7ebe4' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  badgeText_green: { color: colors.green },
  badgeText_amber: { color: colors.amber },
  badgeText_red: { color: colors.red },
  badgeText_neutral: { color: colors.muted },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
});
