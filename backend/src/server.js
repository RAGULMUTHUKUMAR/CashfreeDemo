require('dotenv').config();
const { CashfreeService } = require('./cashfreeService');
const { readConfig } = require('./config');
const { PaymentService } = require('./paymentService');
const { SqliteOrderRepository } = require('./repository');
const { createApp } = require('./app');

const config = readConfig();
const repository = new SqliteOrderRepository(config.databasePath);
const paymentService = new PaymentService(
  new CashfreeService(config),
  repository,
);
const app = createApp(paymentService, config);

app.listen(config.port, '0.0.0.0');
