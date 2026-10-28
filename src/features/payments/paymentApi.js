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

async function request(path, options = {}) {
  const method = options.method || 'GET';
  const requestPayload = options.data;

  try {
    const response = await paymentApi.request({
      url: path,
      method,
      data: requestPayload,
    });
    console.log(`GetMethod:${response}`);
    const body = response.data;
    if (!body || typeof body !== 'object') {
      throw new ApiError('The backend returned an invalid response.');
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (axios.isAxiosError(error) && error.response) {
      const body = error.response.data;
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
      throw new ApiError(
        'The request timed out. Check the backend connection and try again.',
      );
    }
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

export async function createOrder(customer) {
  const body = await request('/api/payments/orders', {
    method: 'POST',
    data: customer,
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
