const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { ZodError } = require('zod');
const { hasCashfreeCredentials } = require('./config');
const { CashfreeConfigurationError } = require('./cashfreeService');
const {
  InvalidCashfreeResponseError,
  OrderNotFoundError,
} = require('./paymentService');
const { orderIdSchema, createOrderSchema } = require('./validation');

function createApp(paymentService, config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      environment: config.cashfreeEnvironment,
      cashfreeConfigured: hasCashfreeCredentials(config),
    });
  });

  const payments = express.Router();
  payments.use(
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );

  payments.post('/orders', async (request, response, next) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: 'Check the customer details and amount.' });
      return;
    }

    try {
      const result = await paymentService.createOrder(parsed.data);
      response.status(201).json({
        orderId: result.order.orderId,
        amount: result.order.amount,
        status: result.order.status,
        createdAt: result.order.createdAt,
        paymentSessionId: result.paymentSessionId,
      });
    } catch (error) {
      next(error);
    }
  });

  payments.get('/orders', (_request, response) => {
    response.json({ orders: paymentService.listOrders() });
  });

  payments.get('/orders/:orderId', async (request, response, next) => {
    const parsed = orderIdSchema.safeParse(request.params.orderId);
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid order ID.' });
      return;
    }

    try {
      const order = await paymentService.verifyOrder(parsed.data);
      response.json({ order });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/payments', payments);

  app.use((error, _request, response, _next) => {
    if (error instanceof CashfreeConfigurationError) {
      response.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof OrderNotFoundError) {
      response.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof InvalidCashfreeResponseError) {
      response
        .status(502)
        .json({ error: 'Cashfree returned an invalid response.' });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({ error: 'Invalid request data.' });
      return;
    }
    response
      .status(502)
      .json({ error: 'The payment service is temporarily unavailable.' });
  });

  return app;
}

module.exports = { createApp };
