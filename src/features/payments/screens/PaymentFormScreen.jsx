import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { validatePaymentForm } from '../validation';
import {
  AppButton,
  AppInput,
  colors,
  ScreenFrame,
} from '../../../components/PaymentUI';

const initialValues = { name: '', email: '', phone: '', amount: '' };

export default function PaymentFormScreen({
  onBack,
  onSubmit,
  submitting,
  errorMessage,
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});

  const updateValue = field => value => {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const result = validatePaymentForm(values);
    setErrors(result.errors);
    if (result.value) {
      onSubmit(result.value);
    }
  };

  return (
    <ScreenFrame>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.back}
      >
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.eyebrow}>NEW ORDER</Text>
      <Text style={styles.title}>Payment details</Text>
      <Text style={styles.subtitle}>
        Enter a customer and amount to create a fresh Cashfree Sandbox order.
      </Text>

      <View style={styles.form}>
        <AppInput
          autoCapitalize="words"
          error={errors.name}
          label="Customer name"
          maxLength={100}
          onChangeText={updateValue('name')}
          placeholder="Name"
          value={values.name}
        />
        <AppInput
          error={errors.email}
          keyboardType="email-address"
          label="Customer email"
          onChangeText={updateValue('email')}
          placeholder="name@example.com"
          value={values.email}
        />
        <AppInput
          error={errors.phone}
          keyboardType="phone-pad"
          label="Indian mobile number"
          maxLength={14}
          onChangeText={updateValue('phone')}
          placeholder="9876543210"
          value={values.phone}
        />
        <AppInput
          error={errors.amount}
          keyboardType="decimal-pad"
          label="Amount (INR)"
          onChangeText={updateValue('amount')}
          placeholder="100.00"
          value={values.amount}
        />
        <Text style={styles.limit}>
          Amount range: Rs 1.00 to Rs 1,00,000.00
        </Text>
        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.formError}>
            {errorMessage}
          </Text>
        ) : null}
        <AppButton
          label="Create order and checkout"
          onPress={submit}
          busy={submitting}
        />
      </View>
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
  title: { color: colors.ink, fontSize: 29, fontWeight: '900', marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  form: { marginTop: 26 },
  limit: { color: colors.muted, fontSize: 12, marginTop: -7, marginBottom: 16 },
  formError: {
    color: colors.red,
    backgroundColor: '#f5e1dd',
    borderRadius: 4,
    padding: 11,
    marginBottom: 14,
    fontSize: 13,
  },
});
