import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AppButton,
  colors,
  formatDate,
  formatRupees,
  ScreenFrame,
  StatusBadge,
} from '../../../components/PaymentUI';

export default function PaymentHistoryScreen({
  orders,
  loading,
  errorMessage,
  onBack,
  onRefresh,
}) {
  return (
    <ScreenFrame>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.back}
      >
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>PAYMENTS</Text>
          <Text style={styles.title}>History</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh history"
          onPress={onRefresh}
          style={styles.refresh}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      {loading ? (
        <Text style={styles.message}>Loading transaction history...</Text>
      ) : null}
      {!loading && orders.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No transactions</Text>
          <Text style={styles.message}>
            Orders created by this demo will appear here.
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {orders.map(order => (
          <View key={order.orderId} style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.amount}>{formatRupees(order.amount)}</Text>
              <StatusBadge status={order.status} />
            </View>
            <Text selectable style={styles.orderId}>
              {order.orderId}
            </Text>
            <Text style={styles.date}>{formatDate(order.createdAt)}</Text>
          </View>
        ))}
      </View>
      {errorMessage ? (
        <AppButton label="Retry" onPress={onRefresh} secondary />
      ) : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: colors.green, fontSize: 15, fontWeight: '700' },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20,
  },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 29, fontWeight: '900', marginTop: 4 },
  refresh: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 10 },
  refreshText: { color: colors.green, fontSize: 14, fontWeight: '700' },
  message: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  error: { color: colors.red, fontSize: 13, lineHeight: 18, marginTop: 17 },
  empty: { paddingVertical: 24 },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  list: { marginTop: 18, borderTopWidth: 1, borderColor: colors.line },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  orderId: { color: colors.ink, fontSize: 12, marginTop: 11 },
  date: { color: colors.muted, fontSize: 12, marginTop: 5 },
});
