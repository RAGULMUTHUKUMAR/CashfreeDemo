const { createHash, randomUUID } = require('node:crypto');

class OrderNotFoundError extends Error {
  constructor() {
    super('This order is not part of this demo.');
    this.name = 'OrderNotFoundError';
  }
}

class InvalidCashfreeResponseError extends Error {
  constructor() {
    super('Cashfree returned an incomplete or invalid order response.');
    this.name = 'InvalidCashfreeResponseError';
  }
}

class IdempotencyConflictError extends Error {
  constructor() {
    super('This idempotency key was already used for different payment details.');
    this.name = 'IdempotencyConflictError';
  }
}

function normalizePaymentStatus(payments) {
  const statuses = payments.map(payment =>
    typeof payment?.payment_status === 'string'
      ? payment.payment_status.toUpperCase()
      : undefined,
  );
  if (statuses.includes('SUCCESS')) {
    return 'SUCCESS';
  }
  if (statuses.length === 0) {
    return 'PENDING';
  }
  if (statuses.some(status => !status)) {
    return 'UNVERIFIABLE';
  }
  if (statuses.some(status => ['PENDING', 'NOT_ATTEMPTED'].includes(status))) {
    return 'PENDING';
  }

  const terminalStatuses = [
    'USER_DROPPED',
    'CANCELLED',
    'FAILED',
    'FLAGGED',
    'VOID',
  ];
  if (statuses.some(status => !terminalStatuses.includes(status))) {
    return 'UNVERIFIABLE';
  }
  if (statuses.every(status => ['USER_DROPPED', 'CANCELLED'].includes(status))) {
    return 'CANCELLED';
  }
  return 'FAILED';
}

function isOptionalString(value) {
  return value == null || typeof value === 'string';
}

function isOptionalObject(value) {
  return (
    value == null ||
    (typeof value === 'object' && !Array.isArray(value))
  );
}

class PaymentService {
  constructor(gateway, repository) {
    this.gateway = gateway;
    this.repository = repository;
    this.inFlightCreations = new Map();
  }

  async createOrder(input, idempotencyKey) {
    const requestHash = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    const reservation = this.repository.reserveCreation(
      idempotencyKey,
      requestHash,
      `cf_demo_${randomUUID().replaceAll('-', '')}`,
      new Date().toISOString(),
    );
    if (reservation.requestHash !== requestHash) {
      throw new IdempotencyConflictError();
    }

    const completed = this.repository.findCompletedCreation(idempotencyKey);
    if (completed) {
      return completed;
    }

    const inFlight = this.inFlightCreations.get(idempotencyKey);
    if (inFlight) {
      return inFlight;
    }

    const creation = this.createReservedOrder(
      input,
      reservation.orderId,
      idempotencyKey,
    );
    this.inFlightCreations.set(idempotencyKey, creation);
    try {
      return await creation;
    } finally {
      if (this.inFlightCreations.get(idempotencyKey) === creation) {
        this.inFlightCreations.delete(idempotencyKey);
      }
    }
  }

  async createReservedOrder(input, orderId, idempotencyKey) {
    const response = await this.gateway.createOrder(
      input,
      orderId,
      idempotencyKey,
    );
    if (
      !response ||
      typeof response !== 'object' ||
      response.order_id !== orderId ||
      typeof response.payment_session_id !== 'string' ||
      response.payment_session_id.length === 0 ||
      (response.cf_order_id != null &&
        (typeof response.cf_order_id !== 'string' ||
          response.cf_order_id.length === 0)) ||
      (response.order_amount != null &&
        (!Number.isFinite(response.order_amount) ||
          response.order_amount !== input.amount)) ||
      (response.order_currency != null && response.order_currency !== 'INR') ||
      !isOptionalString(response.entity) ||
      !isOptionalString(response.order_status) ||
      !isOptionalString(response.order_expiry_time) ||
      !isOptionalString(response.created_at) ||
      !isOptionalObject(response.customer_details) ||
      !isOptionalObject(response.order_meta)
    ) {
      throw new InvalidCashfreeResponseError();
    }

    const order = {
      orderId,
      cfOrderId: response.cf_order_id,
      amount: input.amount,
      currency: response.order_currency || 'INR',
      status: 'PENDING',
      cashfreeOrderStatus: response.order_status,
      orderExpiryTime: response.order_expiry_time,
      createdAt: response.created_at || new Date().toISOString(),
    };
    this.repository.completeCreation(
      idempotencyKey,
      order,
      response.payment_session_id,
    );
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
    if (
      !remoteOrder ||
      remoteOrder.order_id !== orderId ||
      !Array.isArray(payments)
    ) {
      this.repository.updateStatus(orderId, 'UNVERIFIABLE');
      return { ...storedOrder, status: 'UNVERIFIABLE' };
    }

    const cashfreeOrderStatus =
      typeof remoteOrder.order_status === 'string'
        ? remoteOrder.order_status.toUpperCase()
        : undefined;
    const knownOrderStatuses = [
      'ACTIVE',
      'PAID',
      'EXPIRED',
      'TERMINATED',
      'TERMINATION_REQUESTED',
    ];
    let status = normalizePaymentStatus(payments);
    if (status !== 'SUCCESS') {
      if (cashfreeOrderStatus === 'PAID') {
        status = 'SUCCESS';
      } else if (cashfreeOrderStatus === 'EXPIRED') {
        status = 'EXPIRED';
      } else if (cashfreeOrderStatus === 'TERMINATED') {
        status = 'CANCELLED';
      } else if (
        cashfreeOrderStatus &&
        !knownOrderStatuses.includes(cashfreeOrderStatus)
      ) {
        status = 'UNVERIFIABLE';
      }
    }

    this.repository.updateStatus(
      orderId,
      status,
      remoteOrder.order_status,
      remoteOrder.order_expiry_time,
    );
    return {
      ...storedOrder,
      status,
      cashfreeOrderStatus: remoteOrder.order_status,
      orderExpiryTime: remoteOrder.order_expiry_time,
    };
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
  IdempotencyConflictError,
  normalizePaymentStatus,
};
