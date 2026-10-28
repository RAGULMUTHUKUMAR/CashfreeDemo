import axios from 'axios';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../../config/environment';

const paymentApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function safeDiagnosticMessage(message) {
  if (typeof message !== 'string') {
    return undefined;
  }
  return message
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\+?\d[\d ()-]{8,}\d/g, '[PHONE]')
    .slice(0, 240);
}

function logApiFailure(method, path, details) {
  const safeDetails = Object.fromEntries(
    Object.entries({ method, path, ...details }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  console.error(`[payment-api] request.failed ${JSON.stringify(safeDetails)}`);
}

async function request(path, options = {}) {
  const method = options.method || 'GET';
  const requestPayload = options.data;

  try {
    const response = await paymentApi.request({
      url: path,
      method,
      data: requestPayload,
      headers: options.headers,
    });
    const body = response.data;
    if (!body || typeof body !== 'object') {
      throw new ApiError('The backend returned an invalid response.');
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) {
      logApiFailure(method, path, {
        name: error.name,
        status: error.status,
        message: safeDiagnosticMessage(error.message),
      });
      throw error;
    }
    if (axios.isAxiosError(error) && error.response) {
      const body = error.response.data;
      logApiFailure(method, path, {
        status: error.response.status,
        code: body?.code ?? error.code,
        message: safeDiagnosticMessage(
          typeof body?.error === 'string' ? body.error : error.message,
        ),
      });
      throw new ApiError(
        typeof body?.error === 'string'
          ? body.error
          : 'The backend could not complete the request.',
        error.response.status,
      );
    }
    if (
      axios.isAxiosError(error) &&
      ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)
    ) {
      logApiFailure(method, path, {
        code: error.code,
        message: 'request timed out',
      });
      throw new ApiError(
        'The request timed out. Check the backend connection and try again.',
      );
    }
    logApiFailure(method, path, {
      code: error?.code,
      name: error?.name,
      message: safeDiagnosticMessage(error?.message),
    });
    throw new ApiError(
      'Could not reach the backend. Check the server and network connection.',
    );
  }
}

export async function checkBackend() {
  const body = await request('/health');
  if (
    body.status !== 'ok' ||
    (body.environment !== 'SANDBOX' && body.environment !== 'PRODUCTION') ||
    typeof body.cashfreeConfigured !== 'boolean'
  ) {
    throw new ApiError('The backend returned an invalid health response.');
  }
  return body;
}

export async function createOrder(customer, idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    throw new ApiError('A payment request key is required.');
  }
  const body = await request('/api/payments/orders', {
    method: 'POST',
    data: customer,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  if (
    typeof body.orderId !== 'string' ||
    typeof body.paymentSessionId !== 'string' ||
    body.paymentSessionId.length === 0 ||
    typeof body.amount !== 'number' ||
    typeof body.createdAt !== 'string' ||
    body.status !== 'PENDING'
  ) {
    throw new ApiError('The backend returned an incomplete payment session.');
  }
  return body;
}

export async function verifyOrder(orderId) {
  const body = await request(
    `/api/payments/orders/${encodeURIComponent(orderId)}`,
  );
  const order = body.order;
  if (
    !order ||
    order.orderId !== orderId ||
    typeof order.amount !== 'number' ||
    typeof order.createdAt !== 'string' ||
    ![
      'PENDING',
      'SUCCESS',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'UNVERIFIABLE',
    ].includes(order.status)
  ) {
    throw new ApiError('The backend returned an invalid payment status.');
  }
  return order;
}

export async function listOrders() {
  const body = await request('/api/payments/orders');
  if (!Array.isArray(body.orders)) {
    throw new ApiError('The backend returned invalid transaction history.');
  }
  return body.orders;
}
