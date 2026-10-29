const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { describe, it } = require('node:test');
const request = require('supertest');
const { createApp } = require('../app');
const {
  CashfreeService,
  safeOrderRequestForLog,
  safeOrderResponseForLog,
} = require('../cashfreeService');
const { PaymentService } = require('../paymentService');
const { SqliteOrderRepository } = require('../repository');
const { createOrderSchema } = require('../validation');

class MockCashfree {
  paymentStatuses = [];
  failCreate = false;
  failCreateStatus = undefined;
  failVerify = false;
  missingSession = false;
  malformedAmount = false;
  createCalls = 0;
  createdOrderIds = [];
  idempotencyKeys = [];
  cashfreeOrderStatus = 'ACTIVE';

  async createOrder(input, orderId, idempotencyKey) {
    this.createCalls += 1;
    this.createdOrderIds.push(orderId);
    this.idempotencyKeys.push(idempotencyKey);
    if (this.failCreate) {
      const error = new Error('Cashfree unavailable');
      if (this.failCreateStatus) {
        error.response = { status: this.failCreateStatus, data: {} };
      }
      throw error;
    }
    return {
      cf_order_id: `cf_${orderId}`,
      created_at: '2026-10-28T12:00:00+05:30',
      customer_details: {
        customer_id: 'demo123',
        customer_name: input.name,
        customer_email: input.email,
        customer_phone: '+919876543210',
        customer_uid: 'customer-uid',
      },
      entity: 'order',
      order_id: orderId,
      order_amount: this.malformedAmount ? input.amount + 1 : input.amount,
      payment_session_id: this.missingSession ? undefined : 'session_test_only',
      order_currency: 'INR',
      order_expiry_time: '2026-10-29T12:00:00+05:30',
      order_meta: {
        return_url: `https://merchant.example/return?order_id=${orderId}`,
        payment_methods: 'cc',
        notify_url: 'https://merchant.example/notify',
      },
      order_note: 'Order created for payment',
      order_splits: [],
      order_status: 'ACTIVE',
      order_tags: { product: 'meter recharge' },
      terminal_data: null,
      cart_details: { cart_id: 'cart-1' },
    };
  }

  async fetchOrder(orderId) {
    if (this.failVerify) {
      const error = new Error('Cashfree unavailable');
      error.response = {
        status: 401,
        data: {
          code: 'authentication_failed',
          message:
            'Cashfree rejected the configured credentials cfsk_test_secret',
        },
      };
      throw error;
    }
    return { order_id: orderId, order_status: this.cashfreeOrderStatus };
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

function postOrder(app, payload = input, idempotencyKey = randomUUID()) {
  return request(app)
    .post('/api/payments/orders')
    .set('Idempotency-Key', idempotencyKey)
    .send(payload);
}

describe('Cashfree order request', () => {
  it('uses the documented payload fields, API version, and configured return URL', async () => {
    const service = new CashfreeService({
      ...config,
      cashfreeClientId: 'test-client-id',
      cashfreeClientSecret: 'test-client-secret',
      cashfreeApiVersion: '2026-01-01',
      cashfreeReturnUrl: 'https://merchant.example/return?order_id={order_id}',
    });
    assert.equal(service.client().XApiVersion, '2026-01-01');

    let capturedRequest;
    let capturedIdempotencyKey;
    service.client = () => ({
      PGCreateOrder: async (requestBody, _requestId, idempotencyKey) => {
        capturedRequest = requestBody;
        capturedIdempotencyKey = idempotencyKey;
        return {
          data: {
            cf_order_id: 'cf_order_test',
            order_id: requestBody.order_id,
            order_amount: requestBody.order_amount,
            order_currency: requestBody.order_currency,
            order_status: 'ACTIVE',
            payment_session_id: 'session_test_only',
          },
        };
      },
    });

    const idempotencyKey = randomUUID();
    const originalConsoleInfo = console.info;
    const logLines = [];
    console.info = line => logLines.push(line);
    try {
      await service.createOrder(input, 'cf_demo_test_order', idempotencyKey);
    } finally {
      console.info = originalConsoleInfo;
    }

    assert.deepEqual(capturedRequest, {
      order_id: 'cf_demo_test_order',
      order_amount: 125.5,
      order_currency: 'INR',
      customer_details: {
        customer_id: capturedRequest.customer_details.customer_id,
        customer_name: input.name,
        customer_email: input.email,
        customer_phone: '+919876543210',
      },
      order_meta: {
        return_url:
          'https://merchant.example/return?order_id=cf_demo_test_order',
      },
    });
    assert.match(
      capturedRequest.customer_details.customer_id,
      /^demo[a-f0-9]{32}$/,
    );
    assert.equal(capturedIdempotencyKey, idempotencyKey);
    assert.equal(logLines.length, 2);
    assert.match(logLines[0], /"order_amount":125\.5/);
    assert.match(logLines[0], /"customer_email":"\[REDACTED\]"/);
    assert.doesNotMatch(
      logLines[0],
      /customer@example\.com|\+919876543210|merchant\.example/,
    );
    assert.match(logLines[1], /"cf_order_id":"cf_order_test"/);
    assert.match(logLines[1], /"payment_session_id":"\[REDACTED\]"/);
    assert.doesNotMatch(logLines[1], /session_test_only/);
    assert.equal(
      safeOrderRequestForLog(capturedRequest).customer_details.customer_name,
      '[REDACTED]',
    );
    assert.equal(
      safeOrderResponseForLog({
        order_id: 'cf_demo_test_order',
        payment_session_id: 'session_test_only',
      }).payment_session_id,
      '[REDACTED]',
    );
  });
});

describe('SQLite migration', () => {
  it('preserves existing orders and adds Cashfree/idempotency storage', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'cashfree-demo-'));
    const databasePath = path.join(directory, 'payments.sqlite');
    const oldDatabase = new DatabaseSync(databasePath);
    const legacyOrderId = `cf_demo_${'a'.repeat(32)}`;
    oldDatabase.exec(`
      CREATE TABLE payment_orders (
        order_id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    oldDatabase
      .prepare(
        'INSERT INTO payment_orders (order_id, amount, status, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(legacyOrderId, 25, 'PENDING', '2026-10-28T12:00:00.000Z');
    oldDatabase.close();

    let repository;
    try {
      repository = new SqliteOrderRepository(databasePath);
      const legacyOrder = repository.find(legacyOrderId);
      assert.equal(legacyOrder.amount, 25);
      assert.equal(legacyOrder.currency, 'INR');
      assert.equal(legacyOrder.status, 'PENDING');
      assert.equal(
        repository.database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payment_order_requests'",
          )
          .get().name,
        'payment_order_requests',
      );
    } finally {
      repository?.database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

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

  it('requires a valid UUID idempotency key before creating an order', async () => {
    const { app, gateway } = setup();
    const response = await request(app)
      .post('/api/payments/orders')
      .send(input);

    assert.equal(response.status, 400);
    assert.equal(gateway.createCalls, 0);
  });

  it('creates a new order and returns its fresh payment session', async () => {
    const { app, gateway, repository } = setup();
    const idempotencyKey = randomUUID();
    const response = await postOrder(app, input, idempotencyKey);

    assert.equal(response.status, 201);
    assert.match(response.body.orderId, /^cf_demo_[a-f0-9]{32}$/);
    assert.equal(response.body.paymentSessionId, 'session_test_only');
    assert.equal(response.body.status, 'PENDING');
    assert.equal(response.body.cf_order_id, `cf_${response.body.orderId}`);
    assert.equal(response.body.order_id, response.body.orderId);
    assert.equal(response.body.order_amount, input.amount);
    assert.equal(response.body.order_currency, 'INR');
    assert.equal(response.body.order_status, 'ACTIVE');
    assert.equal(response.body.payment_session_id, 'session_test_only');
    assert.equal(response.body.entity, 'order');
    assert.equal(response.body.customer_details.customer_uid, 'customer-uid');
    assert.equal(response.body.order_meta.payment_methods, 'cc');
    assert.deepEqual(response.body.order_splits, []);
    assert.deepEqual(response.body.terminal_data, null);
    assert.deepEqual(response.body.cart_details, { cart_id: 'cart-1' });
    assert.equal(repository.find(response.body.orderId).amount, input.amount);
    assert.equal(
      repository.find(response.body.orderId).cfOrderId,
      `cf_${response.body.orderId}`,
    );
    assert.equal(gateway.idempotencyKeys[0], idempotencyKey);
  });

  it('replays a completed creation for the same key and rejects changed details', async () => {
    const { app, gateway, repository } = setup();
    const idempotencyKey = randomUUID();
    const [first, replay] = await Promise.all([
      postOrder(app, input, idempotencyKey),
      postOrder(app, input, idempotencyKey),
    ]);
    const conflict = await postOrder(
      app,
      { ...input, amount: input.amount + 1 },
      idempotencyKey,
    );

    assert.equal(first.status, 201);
    assert.equal(replay.status, 201);
    assert.equal(replay.body.orderId, first.body.orderId);
    assert.equal(replay.body.paymentSessionId, first.body.paymentSessionId);
    assert.equal(replay.body.cf_order_id, first.body.cf_order_id);
    assert.equal(replay.body.order_status, first.body.order_status);
    assert.equal(conflict.status, 409);
    assert.equal(gateway.createCalls, 1);
    assert.equal(repository.list(50).length, 1);
  });

  it('returns a safe error if Cashfree order creation fails', async () => {
    const { app, gateway } = setup();
    gateway.failCreate = true;
    const idempotencyKey = randomUUID();
    const response = await postOrder(app, input, idempotencyKey);
    gateway.failCreate = false;
    const retry = await postOrder(app, input, idempotencyKey);

    assert.equal(response.status, 502);
    assert.equal(
      response.body.error,
      'The payment service is temporarily unavailable.',
    );
    assert.equal(retry.status, 201);
    assert.equal(gateway.createdOrderIds[0], gateway.createdOrderIds[1]);
    assert.equal(gateway.idempotencyKeys[0], gateway.idempotencyKeys[1]);
  });

  it('maps Cashfree authentication failures to a safe configuration error', async () => {
    const { app, gateway } = setup();
    gateway.failCreate = true;
    gateway.failCreateStatus = 401;

    const response = await postOrder(app);
    assert.equal(response.status, 503);
    assert.equal(
      response.body.error,
      'Cashfree credentials were rejected by the payment provider.',
    );
  });

  it('explains that Cashfree backend credentials are missing', async () => {
    const repository = new SqliteOrderRepository(':memory:');
    const service = new PaymentService(new CashfreeService(config), repository);
    const app = createApp(service, config);

    const health = await request(app).get('/health');
    assert.equal(health.body.cashfreeConfigured, false);

    const response = await postOrder(app);
    assert.equal(response.status, 503);
    assert.match(response.body.error, /credentials are not configured/i);
  });

  it('rejects a Cashfree order response without a fresh payment session', async () => {
    const { app, gateway, repository } = setup();
    gateway.missingSession = true;

    const response = await postOrder(app);
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'Cashfree returned an invalid response.');
    assert.equal(repository.list(50).length, 0);
  });

  it('rejects a Cashfree response with an unexpected amount', async () => {
    const { app, gateway, repository } = setup();
    gateway.malformedAmount = true;

    const response = await postOrder(app);
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'Cashfree returned an invalid response.');
    assert.equal(repository.list(50).length, 0);
  });

  it('uses the server payment response to distinguish success, pending, failed and cancelled', async () => {
    const { app, gateway } = setup();
    const created = await postOrder(app);
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
    const created = await postOrder(app);
    gateway.paymentStatuses = ['UNRECOGNIZED'];

    const response = await request(app).get(
      `/api/payments/orders/${created.body.orderId}`,
    );
    assert.equal(response.body.order.status, 'UNVERIFIABLE');
  });

  it('treats a Cashfree EXPIRED order as expired, not pending or successful', async () => {
    const { app, gateway } = setup();
    const created = await postOrder(app);
    gateway.cashfreeOrderStatus = 'EXPIRED';

    const response = await request(app).get(
      `/api/payments/orders/${created.body.orderId}`,
    );
    assert.equal(response.body.order.status, 'EXPIRED');
  });

  it('returns a safe error when Cashfree order verification fails', async () => {
    const { app, gateway } = setup();
    const created = await postOrder(app);
    gateway.failVerify = true;
    const response = await request(app).get(
      `/api/payments/orders/${created.body.orderId}`,
    );

    assert.equal(response.status, 503);
    assert.equal(
      response.body.error,
      'Cashfree credentials were rejected by the payment provider.',
    );
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
    const response = await postOrder(app);
    assert.equal(response.status, 201);
    const history = await request(app).get('/api/payments/orders');
    assert.equal(history.body.orders.length, 1);
    assert.equal(history.body.orders[0].orderId, response.body.orderId);
  });
});
