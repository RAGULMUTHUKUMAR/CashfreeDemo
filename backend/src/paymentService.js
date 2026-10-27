const { randomUUID } = require('node:crypto');

class OrderNotFoundError extends Error {
  constructor() {
    super('This order is not part of this demo.');
    this.name = 'OrderNotFoundError';
  }
}

class InvalidCashfreeResponseError extends Error {
  constructor() {
    super('Cashfree returned an incomplete order response.');
    this.name = 'InvalidCashfreeResponseError';
  }
}

function normalizePaymentStatus(payments) {
  const statuses = payments.map(payment =>
    payment.payment_status?.toUpperCase(),
  );
  if (statuses.includes('SUCCESS')) {
    return 'SUCCESS';
  }
  if (statuses.length === 0 || statuses.some(status => !status)) {
    return statuses.length === 0 ? 'PENDING' : 'UNVERIFIABLE';
  }
  if (
    statuses.some(status => ['PENDING', 'NOT_ATTEMPTED'].includes(status || ''))
  ) {
    return 'PENDING';
  }
  const terminalStatuses = [
    'USER_DROPPED',
    'CANCELLED',
    'FAILED',
    'FLAGGED',
    'VOID',
  ];
  if (statuses.some(status => !terminalStatuses.includes(status || ''))) {
    return 'UNVERIFIABLE';
  }
  if (
    statuses.every(status =>
      ['USER_DROPPED', 'CANCELLED'].includes(status || ''),
    )
  ) {
    return 'CANCELLED';
  }
  return 'FAILED';
}

class PaymentService {
  constructor(gateway, repository) {
    this.gateway = gateway;
    this.repository = repository;
  }

  async createOrder(input) {
    const orderId = `cf_demo_${randomUUID().replaceAll('-', '')}`;
    const response = await this.gateway.createOrder(input, orderId);
    if (response.order_id !== orderId || !response.payment_session_id) {
      throw new InvalidCashfreeResponseError();
    }

    const order = {
      orderId,
      amount: input.amount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.repository.create(order);
    return { order, paymentSessionId: response.payment_session_id };
  }

  async verifyOrder(orderId) {
    const storedOrder = this.repository.find(orderId);
    if (!storedOrder) {
      throw new OrderNotFoundError();
    }

    const [remoteOrder, payments] = await Promise.all([
      this.gateway.fetchOrder(orderId),
      this.gateway.fetchPayments(orderId),
    ]);
    if (remoteOrder.order_id !== orderId || !Array.isArray(payments)) {
      this.repository.updateStatus(orderId, 'UNVERIFIABLE');
      return { ...storedOrder, status: 'UNVERIFIABLE' };
    }

    const status = normalizePaymentStatus(payments);
    this.repository.updateStatus(orderId, status);
    return { ...storedOrder, status };
  }

  findOrder(orderId) {
    return this.repository.find(orderId);
  }

  listOrders() {
    return this.repository.list(50);
  }
}

module.exports = {
  PaymentService,
  OrderNotFoundError,
  InvalidCashfreeResponseError,
  normalizePaymentStatus,
};
