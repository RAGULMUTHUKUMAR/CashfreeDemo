const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { ZodError } = require('zod');
const { hasCashfreeCredentials } = require('./config');
const { CashfreeConfigurationError } = require('./cashfreeService');
const {
  IdempotencyConflictError,
  InvalidCashfreeResponseError,
  OrderNotFoundError,
} = require('./paymentService');
const {
  idempotencyKeySchema,
  orderIdSchema,
  createOrderSchema,
} = require('./validation');

function safeProviderMessage(message, config) {
  if (typeof message !== 'string' || message.length === 0) {
    return undefined;
  }
  let safeMessage = message.replace(/[\r\n\t]/g, ' ');
  for (const secret of [config.cashfreeClientId, config.cashfreeClientSecret]) {
    if (typeof secret === 'string' && secret.length > 0) {
      safeMessage = safeMessage.split(secret).join('[REDACTED]');
    }
  }
  return safeMessage
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\+?\d[\d ()-]{8,}\d/g, '[PHONE]')
    .slice(0, 240);
}

function logPaymentError(operation, error, config) {
  const providerError = error?.response?.data;
  const details = {
    name: error?.name || 'Error',
    status: error?.response?.status ?? error?.statusCode,
    code: providerError?.code ?? providerError?.error_code ?? error?.code,
    providerMessage: safeProviderMessage(
      providerError?.message ?? providerError?.message_description,
      config,
    ),
    requestId:
      error?.response?.headers?.['x-request-id'] ??
      error?.response?.headers?.['x-cf-request-id'],
  };
  console.error(
    `[payment] ${operation} ${JSON.stringify(
      Object.fromEntries(
        Object.entries(details).filter(([, value]) => value !== undefined),
      ),
    )}`,
  );
}

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
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.get('Idempotency-Key'),
    );
    if (!idempotencyKey.success) {
      response
        .status(400)
        .json({ error: 'A valid Idempotency-Key is required.' });
      return;
    }

    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: 'Check the customer details and amount.' });
      return;
    }

    try {
      const result = await paymentService.createOrder(
        parsed.data,
        idempotencyKey.data,
      );
      response.status(201).json({
        ...result.cashfreeResponse,
        orderId: result.order.orderId,
        amount: result.order.amount,
        status: result.order.status,
        createdAt: result.order.createdAt,
        paymentSessionId: result.paymentSessionId,
      });
    } catch (error) {
      logPaymentError('order.create.failed', error, config);
      next(error);
    }
  });

  payments.get('/orders', (_request, response) => {
    response.json({
      orders: paymentService.listOrders().map(order => ({
        orderId: order.orderId,
        amount: order.amount,
        status: order.status,
        createdAt: order.createdAt,
      })),
    });
  });

  payments.get('/orders/:orderId', async (request, response, next) => {
    const parsed = orderIdSchema.safeParse(request.params.orderId);
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid order ID.' });
      return;
    }

    try {
      const order = await paymentService.verifyOrder(parsed.data);
      response.json({
        order: {
          orderId: order.orderId,
          amount: order.amount,
          status: order.status,
          createdAt: order.createdAt,
        },
      });
    } catch (error) {
      logPaymentError('order.verify.failed', error, config);
      next(error);
    }
  });

  app.use('/api/payments', payments);

  app.use((error, _request, response, _next) => {
    if (error instanceof IdempotencyConflictError) {
      response.status(409).json({ error: error.message });
      return;
    }
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

    const upstreamStatus = error?.response?.status;
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      response
        .status(503)
        .json({
          error: 'Cashfree credentials were rejected by the payment provider.',
        });
      return;
    }
    if (upstreamStatus === 400) {
      response
        .status(502)
        .json({ error: 'Cashfree rejected the order request.' });
      return;
    }
    if (upstreamStatus === 409) {
      response
        .status(409)
        .json({ error: 'Cashfree rejected this order request.' });
      return;
    }
    if (upstreamStatus === 429) {
      response
        .status(503)
        .json({ error: 'Cashfree is temporarily rate limiting requests.' });
      return;
    }
    if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
      response.status(504).json({ error: 'Cashfree request timed out.' });
      return;
    }
    response
      .status(502)
      .json({ error: 'The payment service is temporarily unavailable.' });
  });

  return app;
}

module.exports = { createApp };
