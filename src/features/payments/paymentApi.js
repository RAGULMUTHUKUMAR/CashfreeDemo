import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../../config/environment';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        typeof body?.error === 'string'
          ? body.error
          : 'The backend could not complete the request.',
        response.status,
      );
    }
    if (!body || typeof body !== 'object') {
      throw new ApiError('The backend returned an invalid response.');
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error?.name === 'AbortError') {
      throw new ApiError(
        'The request timed out. Check the backend connection and try again.',
      );
    }
    throw new ApiError(
      'Could not reach the backend. Check the server and network connection.',
    );
  } finally {
    clearTimeout(timeout);
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

export async function createOrder(customer) {
  const body = await request('/api/payments/orders', {
    method: 'POST',
    body: JSON.stringify(customer),
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
    !['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'UNVERIFIABLE'].includes(
      order.status,
    )
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
