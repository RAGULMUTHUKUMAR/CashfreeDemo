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
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  create(order) {
    this.database
      .prepare(
        'INSERT INTO payment_orders (order_id, amount, status, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(order.orderId, order.amount, order.status, order.createdAt);
  }

  find(orderId) {
    const row = this.database
      .prepare(
        'SELECT order_id, amount, status, created_at FROM payment_orders WHERE order_id = ?',
      )
      .get(orderId);

    return row
      ? {
          orderId: row.order_id,
          amount: row.amount,
          status: row.status,
          createdAt: row.created_at,
        }
      : undefined;
  }

  updateStatus(orderId, status) {
    this.database
      .prepare('UPDATE payment_orders SET status = ? WHERE order_id = ?')
      .run(status, orderId);
  }

  list(limit) {
    return this.database
      .prepare(
        'SELECT order_id, amount, status, created_at FROM payment_orders ORDER BY created_at DESC LIMIT ?',
      )
      .all(limit)
      .map(row => ({
        orderId: row.order_id,
        amount: row.amount,
        status: row.status,
        createdAt: row.created_at,
      }));
  }
}

module.exports = { SqliteOrderRepository };
