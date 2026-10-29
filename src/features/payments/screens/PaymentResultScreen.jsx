import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getPaymentPresentation } from '../paymentState';
import {
  AppButton,
  colors,
  formatDate,
  formatRupees,
  ScreenFrame,
  StatusBadge,
} from '../../../components/PaymentUI';

export default function PaymentResultScreen({
  attempt,
  verifying,
  errorMessage,
  onVerify,
  onHome,
}) {
  const presentation = getPaymentPresentation(attempt?.status);
  const cashfreeResponse = attempt?.cashfreeResponse;
  const responseForDisplay = cashfreeResponse
    ? {
        ...cashfreeResponse,
        ...(cashfreeResponse.payment_session_id
          ? { payment_session_id: '[REDACTED: used by checkout]' }
          : {}),
      }
    : undefined;

  return (
    <ScreenFrame>
      <Pressable
        accessibilityRole="button"
        onPress={onHome}
        style={styles.back}
      >
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.eyebrow}>PAYMENT RESULT</Text>
      <View style={styles.statusBlock}>
        <StatusBadge status={attempt?.status} label={presentation.title} />
        <Text style={styles.title}>{presentation.title}</Text>
        <Text style={styles.subtitle}>{presentation.detail}</Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.label}>AMOUNT</Text>
        <Text style={styles.amount}>{formatRupees(attempt?.amount)}</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>CUSTOMER</Text>
        <Text style={styles.value}>
          {attempt?.customerDetails?.name || 'Unavailable'}
        </Text>
        <Text style={styles.contact}>
          {attempt?.customerDetails?.email || 'Email unavailable'}
        </Text>
        <Text style={styles.contact}>
          {attempt?.customerDetails?.phone || 'Phone unavailable'}
        </Text>
        <View style={styles.divider} />
        <Text style={styles.label}>ORDER ID</Text>
        <Text selectable style={styles.orderId}>
          {attempt?.orderId || 'Unavailable'}
        </Text>
        <Text style={styles.date}>{formatDate(attempt?.createdAt)}</Text>
      </View>

      {responseForDisplay ? (
        <View style={styles.responseBlock}>
          <Text style={styles.callbackTitle}>Cashfree order response</Text>
          <Text selectable style={styles.responseJson}>
            {JSON.stringify(responseForDisplay, null, 2)}
          </Text>
        </View>
      ) : null}

      <View style={styles.callbackNote}>
        <Text style={styles.callbackTitle}>Checkout callback</Text>
        <Text style={styles.callbackText}>
          {attempt?.callbackResult === 'verify'
            ? 'Cashfree sent an onVerify callback. The result above still comes from server verification.'
            : attempt?.callbackResult === 'error'
            ? 'Cashfree sent an onError callback. The backend was queried before showing a payment state.'
            : 'No checkout callback was received. The displayed payment state is based on server verification.'}
        </Text>
      </View>

      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      <AppButton
        label="Verify status again"
        onPress={onVerify}
        busy={verifying}
        disabled={verifying}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onHome}
        style={styles.homeLink}
      >
        <Text style={styles.homeText}>Return to home</Text>
      </Pressable>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: colors.green, fontSize: 15, fontWeight: '700' },
  eyebrow: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 20,
  },
  statusBlock: { marginTop: 16 },
  title: { color: colors.ink, fontSize: 27, fontWeight: '900', marginTop: 13 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  summary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 5,
    padding: 17,
    marginTop: 24,
  },
  label: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  amount: { color: colors.ink, fontSize: 25, fontWeight: '900', marginTop: 6 },
  value: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 7 },
  contact: { color: colors.muted, fontSize: 13, marginTop: 4 },
  responseBlock: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 5,
    padding: 14,
    marginTop: 16,
  },
  responseJson: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
  },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  orderId: { color: colors.ink, fontSize: 13, marginTop: 7 },
  date: { color: colors.muted, fontSize: 12, marginTop: 6 },
  callbackNote: {
    backgroundColor: '#e8eee2',
    padding: 14,
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 5,
  },
  callbackTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  callbackText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  error: { color: colors.red, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  homeLink: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  homeText: { color: colors.green, fontSize: 14, fontWeight: '700' },
});
