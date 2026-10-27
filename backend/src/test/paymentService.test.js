const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const request = require('supertest');
const { createApp } = require('../app');
const { CashfreeService } = require('../cashfreeService');
const { PaymentService } = require('../paymentService');
const { SqliteOrderRepository } = require('../repository');
const { createOrderSchema } = require('../validation');

class MockCashfree {
  paymentStatuses = [];
  failCreate = false;
  failVerify = false;
  missingSession = false;

  async createOrder(_input, orderId) {
    if (this.failCreate) {
      throw new Error('Cashfree unavailable');
    }
    return {
      order_id: orderId,
      payment_session_id: this.missingSession ? undefined : 'session_test_only',
    };
  }

  async fetchOrder(orderId) {
    if (this.failVerify) {
      throw new Error('Cashfree unavailable');
    }
    return { order_id: orderId, order_status: 'ACTIVE' };
  }

  async fetchPayments() {
    if (this.failVerify) {
      throw new Error('Cashfree unavailable');
    }
    return this.paymentStatuses.map(payment_status => ({ payment_status }));
  }
}

const config = {
  port: 4000,
  databasePath: ':memory:',
  cashfreeEnvironment: 'SANDBOX',
  cashfreeClientId: undefined,
  cashfreeClientSecret: undefined,
};

const input = {
  name: 'Demo Customer',
  email: 'demo@example.com',
  phone: '9876543210',
  amount: 125.5,
};

describe('payment API', () => {
  function setup() {
    const gateway = new MockCashfree();
    const repository = new SqliteOrderRepository(':memory:');
    const service = new PaymentService(gateway, repository);
    return { gateway, repository, app: createApp(service, config) };
  }

  it('rejects invalid amounts and customer details', () => {
    assert.equal(
      createOrderSchema.safeParse({ ...input, amount: 0 }).success,
      false,
    );
    assert.equal(
      createOrderSchema.safeParse({ ...input, amount: 100001 }).success,
      false,
    );
    assert.equal(
      createOrderSchema.safeParse({ ...input, amount: 10.001 }).success,
      false,
    );
    assert.equal(
      createOrderSchema.safeParse({ ...input, phone: '12345' }).success,
      false,
    );
    assert.equal(
      createOrderSchema.safeParse({ ...input, email: 'bad' }).success,
      false,
    );
  });

  it('creates a new order and returns its fresh payment session', async () => {
    const { app, repository } = setup();
    const response = await request(app)
      .post('/api/payments/orders')
      .send(input);

    assert.equal(response.status, 201);
    assert.match(response.body.orderId, /^cf_demo_[a-f0-9]{32}$/);
    assert.equal(response.body.paymentSessionId, 'session_test_only');
    assert.equal(response.body.status, 'PENDING');
    assert.equal(repository.find(response.body.orderId).amount, input.amount);
  });

  it('returns a safe error if Cashfree order creation fails', async () => {
    const { app, gateway } = setup();
    gateway.failCreate = true;
    const response = await request(app)
      .post('/api/payments/orders')
      .send(input);

    assert.equal(response.status, 502);
    assert.equal(
      response.body.error,
      'The payment service is temporarily unavailable.',
    );
  });

  it('explains that Cashfree backend credentials are missing', async () => {
    const repository = new SqliteOrderRepository(':memory:');
    const service = new PaymentService(new CashfreeService(config), repository);
    const app = createApp(service, config);

    const health = await request(app).get('/health');
    assert.equal(health.body.cashfreeConfigured, false);

    const response = await request(app)
      .post('/api/payments/orders')
      .send(input);
    assert.equal(response.status, 503);
    assert.match(response.body.error, /credentials are not configured/i);
  });

  it('rejects a Cashfree order response without a fresh payment session', async () => {
    const { app, gateway, repository } = setup();
    gateway.missingSession = true;

    const response = await request(app)
      .post('/api/payments/orders')
      .send(input);
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'Cashfree returned an invalid response.');
    assert.equal(repository.list(50).length, 0);
  });

  it('uses the server payment response to distinguish success, pending, failed and cancelled', async () => {
    const { app, gateway } = setup();
    const created = await request(app).post('/api/payments/orders').send(input);
    const orderId = created.body.orderId;

    gateway.paymentStatuses = ['PENDING'];
    assert.equal(
      (await request(app).get(`/api/payments/orders/${orderId}`)).body.order
        .status,
      'PENDING',
    );
    gateway.paymentStatuses = ['FAILED'];
    assert.equal(
      (await request(app).get(`/api/payments/orders/${orderId}`)).body.order
        .status,
      'FAILED',
    );
    gateway.paymentStatuses = ['USER_DROPPED'];
    assert.equal(
      (await request(app).get(`/api/payments/orders/${orderId}`)).body.order
        .status,
      'CANCELLED',
    );
    gateway.paymentStatuses = ['SUCCESS'];
    assert.equal(
      (await request(app).get(`/api/payments/orders/${orderId}`)).body.order
        .status,
      'SUCCESS',
    );
  });

  it('does not interpret unknown Cashfree statuses as pending or success', async () => {
    const { app, gateway } = setup();
    const created = await request(app).post('/api/payments/orders').send(input);
    gateway.paymentStatuses = ['UNRECOGNIZED'];

    const response = await request(app).get(
      `/api/payments/orders/${created.body.orderId}`,
    );
    assert.equal(response.body.order.status, 'UNVERIFIABLE');
  });

  it('rejects malformed and unknown order IDs', async () => {
    const { app } = setup();
    assert.equal(
      (await request(app).get('/api/payments/orders/not-an-order')).status,
      400,
    );
    const response = await request(app).get(
      `/api/payments/orders/cf_demo_${'a'.repeat(32)}`,
    );
    assert.equal(response.status, 404);
  });

  it('returns stored orders newest-first in a bounded history response', async () => {
    const { app } = setup();
    const response = await request(app)
      .post('/api/payments/orders')
      .send(input);
    assert.equal(response.status, 201);
    const history = await request(app).get('/api/payments/orders');
    assert.equal(history.body.orders.length, 1);
    assert.equal(history.body.orders[0].orderId, response.body.orderId);
  });
});
