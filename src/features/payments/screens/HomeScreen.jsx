import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getPaymentPresentation } from '../paymentState';
import {
  AppButton,
  colors,
  formatDate,
  formatRupees,
  ScreenFrame,
  SectionTitle,
  StatusBadge,
} from '../../../components/PaymentUI';

export default function HomeScreen({
  environment,
  backendStatus,
  cashfreeConfigured,
  latestOrder,
  onStartPayment,
  onOpenHistory,
  onRefresh,
}) {
  const presentation = latestOrder
    ? getPaymentPresentation(latestOrder.status)
    : null;

  return (
    <ScreenFrame dark>
      <View style={styles.hero}>
        <View style={styles.topRow}>
          <Text style={styles.eyebrow}>PAYMENTS / ANDROID</Text>
          <StatusBadge
            label={environment || 'CHECKING'}
            status={environment === 'PRODUCTION' ? 'FAILED' : 'SUCCESS'}
          />
        </View>
        <Text style={styles.title}>CashfreeDemo</Text>
        <Text style={styles.subtitle}>
          A live integration flow, from order creation to server verification.
        </Text>
        <View style={styles.environmentRow}>
          <View style={styles.environmentDot} />
          <Text style={styles.environmentText}>
            {environment || 'Environment unavailable'}
          </Text>
        </View>
      </View>

      <View style={styles.connectionRow}>
        <View>
          <Text style={styles.metaLabel}>BACKEND</Text>
          <Text style={styles.connectionText}>
            {backendStatus === 'online'
              ? cashfreeConfigured
                ? 'Connected, credentials ready'
                : 'Connected, credentials missing'
              : backendStatus === 'checking'
              ? 'Checking connection'
              : 'Not reachable'}
          </Text>
        </View>
        <StatusBadge
          status={backendStatus}
          label={backendStatus.toUpperCase()}
        />
      </View>

      {backendStatus === 'offline' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRefresh}
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>Backend unavailable</Text>
          <Text style={styles.noticeText}>
            Check the server URL and network, then tap here to retry.
          </Text>
        </Pressable>
      ) : null}
      {backendStatus === 'online' && !cashfreeConfigured ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Sandbox credentials required</Text>
          <Text style={styles.noticeText}>
            The backend is reachable, but Cashfree credentials are not
            configured.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <AppButton
          label="Start payment"
          onPress={onStartPayment}
          disabled={backendStatus !== 'online' || !cashfreeConfigured}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onOpenHistory}
          style={styles.historyButton}
        >
          <Text style={styles.historyButtonText}>View transaction history</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.latestSection}>
        <SectionTitle>Latest payment attempt</SectionTitle>
        {latestOrder ? (
          <View style={styles.latestPanel}>
            <View style={styles.latestHeading}>
              <StatusBadge
                status={latestOrder.status}
                label={presentation.title}
              />
              <Text style={styles.amount}>
                {formatRupees(latestOrder.amount)}
              </Text>
            </View>
            <Text selectable style={styles.orderId}>
              {latestOrder.orderId}
            </Text>
            <Text style={styles.date}>{formatDate(latestOrder.createdAt)}</Text>
          </View>
        ) : (
          <View style={styles.emptyPanel}>
            <Text style={styles.emptyTitle}>No attempts yet</Text>
            <Text style={styles.emptyText}>
              Your most recent order and its verified status will appear here.
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.footer}>
        Payment status is confirmed by the backend, not by the checkout
        callback.
      </Text>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: -22,
    marginTop: -16,
    padding: 22,
    paddingTop: 26,
    backgroundColor: colors.ink,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { color: '#b8c2b9', fontSize: 11, fontWeight: '800' },
  title: {
    color: colors.white,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 30,
  },
  subtitle: {
    color: '#d3ddd4',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 330,
  },
  environmentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  environmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lime,
    marginRight: 8,
  },
  environmentText: { color: colors.lime, fontSize: 12, fontWeight: '800' },
  connectionRow: {
    marginTop: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  connectionText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 5,
  },
  notice: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#fbf2df',
    borderRadius: 5,
  },
  noticeTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  noticeText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  actions: { marginTop: 22 },
  historyButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyButtonText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  chevron: { color: colors.green, fontSize: 26, fontWeight: '600' },
  latestSection: { marginTop: 20 },
  latestPanel: {
    padding: 15,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 5,
  },
  latestHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  amount: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  orderId: { color: colors.ink, fontSize: 12, marginTop: 14 },
  date: { color: colors.muted, fontSize: 12, marginTop: 6 },
  emptyPanel: {
    paddingVertical: 18,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 25 },
});
