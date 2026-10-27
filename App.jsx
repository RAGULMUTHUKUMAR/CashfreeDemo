import React, { useEffect, useRef, useState } from 'react';
import HomeScreen from './src/features/payments/screens/HomeScreen';
import PaymentFormScreen from './src/features/payments/screens/PaymentFormScreen';
import PaymentHistoryScreen from './src/features/payments/screens/PaymentHistoryScreen';
import PaymentResultScreen from './src/features/payments/screens/PaymentResultScreen';
import {
  launchCheckout,
  registerCheckoutCallbacks,
  removeCheckoutCallbacks,
} from './src/features/payments/cashfreeCheckout';
import {
  checkBackend,
  createOrder,
  listOrders,
  verifyOrder,
} from './src/features/payments/paymentApi';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [environment, setEnvironment] = useState('SANDBOX');
  const [cashfreeConfigured, setCashfreeConfigured] = useState(false);
  const [orders, setOrders] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState('');
  const [resultError, setResultError] = useState('');
  const activeAttempt = useRef(null);
  const verificationInProgress = useRef(false);
  const submissionInProgress = useRef(false);
  const refreshBackendRef = useRef(null);
  const verifyCurrentOrderRef = useRef(null);

  function updateAttempt(nextAttempt) {
    activeAttempt.current = nextAttempt;
    setAttempt(nextAttempt);
  }

  async function refreshHistory() {
    const history = await listOrders();
    setOrders(history);
    return history;
  }

  async function refreshBackend() {
    setBackendStatus('checking');
    try {
      const health = await checkBackend();
      setBackendStatus('online');
      setEnvironment(health.environment);
      setCashfreeConfigured(health.cashfreeConfigured);
      await refreshHistory();
    } catch {
      setBackendStatus('offline');
      setCashfreeConfigured(false);
    }
  }

  refreshBackendRef.current = refreshBackend;

  async function verifyCurrentOrder(orderId, callbackResult) {
    if (
      verificationInProgress.current ||
      activeAttempt.current?.orderId !== orderId
    ) {
      return;
    }
    verificationInProgress.current = true;
    setVerifying(true);
    setResultError('');
    updateAttempt({
      ...activeAttempt.current,
      status: 'VERIFYING',
      callbackResult: callbackResult || activeAttempt.current.callbackResult,
    });

    try {
      const verified = await verifyOrder(orderId);
      updateAttempt({
        ...verified,
        callbackResult: callbackResult || activeAttempt.current?.callbackResult,
      });
      setOrders(current => {
        const remaining = current.filter(
          order => order.orderId !== verified.orderId,
        );
        return [verified, ...remaining];
      });
    } catch (error) {
      updateAttempt({
        ...activeAttempt.current,
        status: 'UNVERIFIABLE',
        callbackResult: callbackResult || activeAttempt.current?.callbackResult,
      });
      setResultError(error.message || 'Unable to verify payment right now.');
    } finally {
      verificationInProgress.current = false;
      setVerifying(false);
    }
  }

  verifyCurrentOrderRef.current = verifyCurrentOrder;

  useEffect(() => {
    refreshBackendRef.current?.();
    registerCheckoutCallbacks({
      onVerify(orderId) {
        verifyCurrentOrderRef.current?.(orderId, 'verify');
      },
      onError(_error, orderId) {
        if (orderId && activeAttempt.current?.orderId === orderId) {
          verifyCurrentOrderRef.current?.(orderId, 'error');
        }
      },
    });
    return removeCheckoutCallbacks;
  }, []);

  async function startPayment(customer) {
    if (submissionInProgress.current) {
      return;
    }
    submissionInProgress.current = true;
    setSubmitting(true);
    setFormError('');
    try {
      const created = await createOrder(customer);
      const newAttempt = {
        orderId: created.orderId,
        amount: created.amount,
        createdAt: created.createdAt,
        status: 'VERIFYING',
        callbackResult: null,
      };
      updateAttempt(newAttempt);
      setScreen('result');
      try {
        launchCheckout(created.paymentSessionId, created.orderId, environment);
      } catch {
        await verifyCurrentOrder(created.orderId, 'error');
        setResultError(
          'Checkout could not be opened. The order status was checked with the backend.',
        );
      }
    } catch (error) {
      setFormError(error.message || 'Could not create the payment order.');
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  }

  const latestOrder = attempt || orders[0] || null;

  if (screen === 'form') {
    return (
      <PaymentFormScreen
        errorMessage={formError}
        onBack={() => {
          setFormError('');
          setScreen('home');
        }}
        onSubmit={startPayment}
        submitting={submitting}
      />
    );
  }

  if (screen === 'result' && attempt) {
    return (
      <PaymentResultScreen
        attempt={attempt}
        errorMessage={resultError}
        onHome={() => setScreen('home')}
        onVerify={() => verifyCurrentOrder(attempt.orderId)}
        verifying={verifying}
      />
    );
  }

  if (screen === 'history') {
    return (
      <PaymentHistoryScreen
        errorMessage={
          backendStatus === 'offline'
            ? 'Could not load history from the backend.'
            : ''
        }
        loading={backendStatus === 'checking'}
        onBack={() => setScreen('home')}
        onRefresh={refreshBackend}
        orders={orders}
      />
    );
  }

  return (
    <HomeScreen
      backendStatus={backendStatus}
      cashfreeConfigured={cashfreeConfigured}
      environment={environment}
      latestOrder={latestOrder}
      onOpenHistory={() => {
        setScreen('history');
        refreshHistory().catch(() => setBackendStatus('offline'));
      }}
      onRefresh={refreshBackend}
      onStartPayment={() => {
        setFormError('');
        setScreen('form');
      }}
    />
  );
}
