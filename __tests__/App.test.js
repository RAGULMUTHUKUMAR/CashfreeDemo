import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { checkBackend } from '../src/features/payments/paymentApi';
import { getPaymentPresentation } from '../src/features/payments/paymentState';
import { validatePaymentForm } from '../src/features/payments/validation';

jest.mock('../src/features/payments/paymentApi', () => ({
  checkBackend: jest.fn().mockResolvedValue({
    status: 'ok',
    environment: 'SANDBOX',
    cashfreeConfigured: false,
  }),
  listOrders: jest.fn().mockResolvedValue([]),
  createOrder: jest.fn(),
  verifyOrder: jest.fn(),
}));

jest.mock('uuid', () => ({ v4: () => '56bb45db-a04c-4bc7-baa3-834a7ae18807' }));

jest.mock('../src/features/payments/cashfreeCheckout', () => ({
  launchCheckout: jest.fn(),
  registerCheckoutCallbacks: jest.fn(),
  removeCheckoutCallbacks: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactNative = require('react');
  return {
    SafeAreaView: ({ children }) => ReactNative.createElement(ReactNative.Fragment, null, children),
  };
});

describe('app startup', () => {
  it('renders the home screen and survives the backend health update', async () => {
    let renderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });

    expect(renderer.toJSON()).not.toBeNull();
    expect(checkBackend).toHaveBeenCalledTimes(1);
  });
});

describe('payment form validation', () => {
  it('accepts a valid Indian customer and INR amount', () => {
    const result = validatePaymentForm({
      name: 'Demo Customer',
      email: 'demo@example.com',
      phone: '+91 9876543210',
      amount: '100.50',
    });

    expect(result.errors).toEqual({});
    expect(result.value).toEqual({
      name: 'Demo Customer',
      email: 'demo@example.com',
      phone: '+91 9876543210',
      amount: 100.5,
    });
  });

  it('rejects malformed email, mobile numbers, and amounts outside the demo range', () => {
    const result = validatePaymentForm({
      name: '',
      email: 'not-an-email',
      phone: '12345',
      amount: '100000.01',
    });

    expect(result.value).toBeUndefined();
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.phone).toBeTruthy();
    expect(result.errors.amount).toBeTruthy();
  });
});

describe('verified payment presentation', () => {
  it('only labels the server success state as successful', () => {
    expect(getPaymentPresentation('SUCCESS').title).toBe('Payment successful');
    expect(getPaymentPresentation('PENDING').title).toBe('Payment pending');
    expect(getPaymentPresentation('FAILED').title).toBe('Payment failed');
    expect(getPaymentPresentation('CANCELLED').title).toBe('Checkout cancelled');
    expect(getPaymentPresentation('UNVERIFIABLE').title).toBe('Unable to verify payment');
  });
});