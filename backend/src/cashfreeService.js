const { createHash } = require('node:crypto');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { hasCashfreeCredentials } = require('./config');
const { normalizeIndianPhone } = require('./validation');

class CashfreeConfigurationError extends Error {
  constructor() {
    super('Cashfree credentials are not configured on the backend.');
    this.name = 'CashfreeConfigurationError';
  }
}

function safeOrderRequestForLog(request) {
  return {
    ...request,
    customer_details: {
      customer_id: request.customer_details.customer_id,
      customer_name: '[REDACTED]',
      customer_email: '[REDACTED]',
      customer_phone: '[REDACTED]',
    },
    ...(request.order_meta
      ? { order_meta: { return_url: '[REDACTED]' } }
      : {}),
  };
}

function safeOrderResponseForLog(response) {
  return {
    cf_order_id: response?.cf_order_id ?? null,
    order_id: response?.order_id ?? null,
    entity: response?.entity ?? null,
    order_amount: response?.order_amount ?? null,
    order_currency: response?.order_currency ?? null,
    order_status: response?.order_status ?? null,
    payment_session_id: response?.payment_session_id
      ? '[REDACTED]'
      : null,
    order_expiry_time: response?.order_expiry_time ?? null,
    created_at: response?.created_at ?? null,
    customer_details: response?.customer_details ? '[REDACTED]' : null,
    order_meta: response?.order_meta ? '[REDACTED]' : null,
  };
}

class CashfreeService {
  constructor(config) {
    this.config = config;
  }

  client() {
    if (!hasCashfreeCredentials(this.config)) {
      throw new CashfreeConfigurationError();
    }

    const environment =
      this.config.cashfreeEnvironment === 'PRODUCTION'
        ? CFEnvironment.PRODUCTION
        : CFEnvironment.SANDBOX;
    const client = new Cashfree(
      environment,
      this.config.cashfreeClientId,
      this.config.cashfreeClientSecret,
    );
    client.XApiVersion = this.config.cashfreeApiVersion || '2026-01-01';
    return client;
  }

  async createOrder(input, orderId, idempotencyKey) {
    const request = {
      order_id: orderId,
      order_amount: input.amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: `demo${createHash('sha256')
          .update(idempotencyKey)
          .digest('hex')
          .slice(0, 32)}`,
        customer_name: input.name,
        customer_email: input.email,
        customer_phone: `+91${normalizeIndianPhone(input.phone)}`,
      },
      ...(this.config.cashfreeReturnUrl
        ? {
            order_meta: {
              return_url: this.config.cashfreeReturnUrl.replaceAll(
                '{order_id}',
                encodeURIComponent(orderId),
              ),
            },
          }
        : {}),
    };
    console.info(
      `[cashfree] create_order.request ${JSON.stringify(safeOrderRequestForLog(request))}`,
    );
    const response = await this.client().PGCreateOrder(
      request,
      undefined,
      idempotencyKey,
      {
        timeout: 10000,
      },
    );
    console.info(
      `[cashfree] create_order.response ${JSON.stringify(safeOrderResponseForLog(response.data))}`,
    );
    return response.data;
  }

  async fetchOrder(orderId) {
    const response = await this.client().PGFetchOrder(
      orderId,
      undefined,
      undefined,
      {
        timeout: 10000,
      },
    );
    return response.data;
  }

  async fetchPayments(orderId) {
    const response = await this.client().PGOrderFetchPayments(
      orderId,
      undefined,
      undefined,
      { timeout: 10000 },
    );
    return response.data;
  }
}

module.exports = {
  CashfreeService,
  CashfreeConfigurationError,
  safeOrderRequestForLog,
  safeOrderResponseForLog,
};
