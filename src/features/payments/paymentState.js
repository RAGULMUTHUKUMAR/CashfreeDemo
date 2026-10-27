const PAYMENT_PRESENTATIONS = {
  VERIFYING: {
    title: 'Verifying payment',
    detail: 'Checking the latest payment status with Cashfree.',
    tone: 'amber',
  },
  SUCCESS: {
    title: 'Payment successful',
    detail: 'Cashfree confirmed this payment as successful.',
    tone: 'green',
  },
  PENDING: {
    title: 'Payment pending',
    detail: 'Cashfree has not confirmed a final payment status yet.',
    tone: 'amber',
  },
  FAILED: {
    title: 'Payment failed',
    detail: 'Cashfree confirmed that the payment attempt failed.',
    tone: 'red',
  },
  CANCELLED: {
    title: 'Checkout cancelled',
    detail: 'Cashfree reports that checkout was cancelled.',
    tone: 'neutral',
  },
  UNVERIFIABLE: {
    title: 'Unable to verify payment',
    detail:
      'The payment status could not be confirmed. Retry verification later.',
    tone: 'red',
  },
};

export function getPaymentPresentation(status) {
  return PAYMENT_PRESENTATIONS[status] || PAYMENT_PRESENTATIONS.UNVERIFIABLE;
}
