const { randomUUID } = require('node:crypto');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { hasCashfreeCredentials } = require('./config');
const { normalizeIndianPhone } = require('./validation');

class CashfreeConfigurationError extends Error {
  constructor() {
    super('Cashfree credentials are not configured on the backend.');
    this.name = 'CashfreeConfigurationError';
  }
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
    return new Cashfree(
      environment,
      this.config.cashfreeClientId,
      this.config.cashfreeClientSecret,
    );
  }

  async createOrder(input, orderId) {
    const request = {
      order_id: orderId,
      order_amount: input.amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: `demo_${randomUUID().replaceAll('-', '')}`,
        customer_name: input.name,
        customer_email: input.email,
        customer_phone: normalizeIndianPhone(input.phone),
      },
    };
    const response = await this.client().PGCreateOrder(
      request,
      undefined,
      orderId,
      {
        timeout: 10000,
      },
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

module.exports = { CashfreeService, CashfreeConfigurationError };
