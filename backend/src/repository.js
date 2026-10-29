const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class SqliteOrderRepository {
  constructor(databasePath) {
    if (databasePath !== ':memory:') {
      mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        order_id TEXT PRIMARY KEY,
        cf_order_id TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL,
        cashfree_order_status TEXT,
        order_expiry_time TEXT,
        created_at TEXT NOT NULL
      )
    `);
    this.addColumn('payment_orders', 'cf_order_id TEXT');
    this.addColumn('payment_orders', "currency TEXT NOT NULL DEFAULT 'INR'");
    this.addColumn('payment_orders', 'cashfree_order_status TEXT');
    this.addColumn('payment_orders', 'order_expiry_time TEXT');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS payment_order_requests (
        idempotency_key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        order_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        cf_order_id TEXT,
        payment_session_id TEXT,
        cashfree_response_json TEXT,
        cashfree_order_status TEXT,
        order_expiry_time TEXT,
        created_at TEXT NOT NULL
      )
    `);
    this.addColumn('payment_order_requests', 'cashfree_response_json TEXT');
  }

  addColumn(tableName, definition) {
    const columnName = definition.split(' ')[0];
    const columns = this.database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all();
    if (!columns.some(column => column.name === columnName)) {
      this.database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    }
  }

  reserveCreation(idempotencyKey, requestHash, orderId, createdAt) {
    const result = this.database
      .prepare(
        `INSERT OR IGNORE INTO payment_order_requests
          (idempotency_key, request_hash, order_id, state, created_at)
         VALUES (?, ?, ?, 'CREATING', ?)`,
      )
      .run(idempotencyKey, requestHash, orderId, createdAt);
    const request = this.database
      .prepare('SELECT * FROM payment_order_requests WHERE idempotency_key = ?')
      .get(idempotencyKey);

    return {
      idempotencyKey: request.idempotency_key,
      requestHash: request.request_hash,
      orderId: request.order_id,
      state: request.state,
      cfOrderId: request.cf_order_id,
      paymentSessionId: request.payment_session_id,
      cashfreeOrderStatus: request.cashfree_order_status,
      orderExpiryTime: request.order_expiry_time,
      created: Number(result.changes) === 1,
    };
  }

  completeCreation(idempotencyKey, order, paymentSessionId, cashfreeResponse) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          `INSERT INTO payment_orders
            (order_id, cf_order_id, amount, currency, status,
             cashfree_order_status, order_expiry_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          order.orderId,
          order.cfOrderId || null,
          order.amount,
          order.currency,
          order.status,
          order.cashfreeOrderStatus || null,
          order.orderExpiryTime || null,
          order.createdAt,
        );
      const update = this.database
        .prepare(
          `UPDATE payment_order_requests
             SET state = 'COMPLETED', cf_order_id = ?, payment_session_id = ?,
               cashfree_response_json = ?, cashfree_order_status = ?,
               order_expiry_time = ?
           WHERE idempotency_key = ?`,
        )
        .run(
          order.cfOrderId || null,
          paymentSessionId,
          JSON.stringify(cashfreeResponse),
          order.cashfreeOrderStatus || null,
          order.orderExpiryTime || null,
          idempotencyKey,
        );
      if (Number(update.changes) !== 1) {
        throw new Error('Payment order idempotency reservation was lost.');
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  findCompletedCreation(idempotencyKey) {
    const row = this.database
      .prepare(
        `SELECT request.order_id, request.payment_session_id,
          request.cashfree_response_json, orders.*
         FROM payment_order_requests AS request
         JOIN payment_orders AS orders ON orders.order_id = request.order_id
         WHERE request.idempotency_key = ? AND request.state = 'COMPLETED'`,
      )
      .get(idempotencyKey);

    if (!row) {
      return undefined;
    }
    let cashfreeResponse;
    try {
      cashfreeResponse = row.cashfree_response_json
        ? JSON.parse(row.cashfree_response_json)
        : undefined;
    } catch {
      cashfreeResponse = undefined;
    }
    return {
      order: {
        orderId: row.order_id,
        cfOrderId: row.cf_order_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        cashfreeOrderStatus: row.cashfree_order_status,
        orderExpiryTime: row.order_expiry_time,
        createdAt: row.created_at,
      },
      paymentSessionId: row.payment_session_id,
      cashfreeResponse,
    };
  }

  find(orderId) {
    const row = this.database
      .prepare(
        `SELECT order_id, cf_order_id, amount, currency, status,
          cashfree_order_status, order_expiry_time, created_at
         FROM payment_orders WHERE order_id = ?`,
      )
      .get(orderId);

    return row
      ? {
          orderId: row.order_id,
          cfOrderId: row.cf_order_id,
          amount: row.amount,
          currency: row.currency,
          status: row.status,
          cashfreeOrderStatus: row.cashfree_order_status,
          orderExpiryTime: row.order_expiry_time,
          createdAt: row.created_at,
        }
      : undefined;
  }

  updateStatus(orderId, status, cashfreeOrderStatus, orderExpiryTime) {
    this.database
      .prepare(
        `UPDATE payment_orders
         SET status = ?, cashfree_order_status = COALESCE(?, cashfree_order_status),
             order_expiry_time = COALESCE(?, order_expiry_time)
         WHERE order_id = ?`,
      )
      .run(
        status,
        cashfreeOrderStatus || null,
        orderExpiryTime || null,
        orderId,
      );
  }

  list(limit) {
    return this.database
      .prepare(
        `SELECT order_id, cf_order_id, amount, currency, status,
          cashfree_order_status, order_expiry_time, created_at
         FROM payment_orders ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit)
      .map(row => ({
        orderId: row.order_id,
        cfOrderId: row.cf_order_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        cashfreeOrderStatus: row.cashfree_order_status,
        orderExpiryTime: row.order_expiry_time,
        createdAt: row.created_at,
      }));
  }
}

module.exports = { SqliteOrderRepository };
