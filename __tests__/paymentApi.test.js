const mockAxiosRequest = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ request: mockAxiosRequest })),
    isAxiosError: error => Boolean(error?.isAxiosError),
  },
}));

const axios = require('axios').default;
const { createOrder } = require('../src/features/payments/paymentApi');

const customer = {
  name: 'Test Customer',
  email: 'customer@example.com',
  phone: '9876543210',
  amount: 499,
};

beforeEach(() => {
  mockAxiosRequest.mockReset();
});

test('sends application fields with a stable idempotency key and reads session fields', async () => {
  mockAxiosRequest.mockResolvedValue({
    status: 201,
    data: {
      orderId: 'cf_demo_0123456789abcdef0123456789abcdef',
      amount: 499,
      status: 'PENDING',
      createdAt: '2026-10-28T12:00:00.000Z',
      paymentSessionId: 'session_test_only',
    },
  });

  const result = await createOrder(customer, '56bb45db-a04c-4bc7-baa3-834a7ae18807');

  expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
  expect(mockAxiosRequest.mock.calls[0][0]).toMatchObject({
    url: '/api/payments/orders',
    method: 'POST',
    data: customer,
    headers: { 'Idempotency-Key': '56bb45db-a04c-4bc7-baa3-834a7ae18807' },
  });
  expect(result.paymentSessionId).toBe('session_test_only');
  expect(result.orderId).toBe('cf_demo_0123456789abcdef0123456789abcdef');
  expect(axios.create).toHaveBeenCalledWith(
    expect.objectContaining({ timeout: expect.any(Number) }),
  );
});

test('rejects an incomplete Cashfree payment session response', async () => {
  mockAxiosRequest.mockResolvedValue({
    status: 201,
    data: { orderId: 'cf_demo_0123456789abcdef0123456789abcdef' },
  });

  await expect(createOrder(customer, '56bb45db-a04c-4bc7-baa3-834a7ae18807'))
    .rejects.toThrow('incomplete payment session');
});

test('logs safe diagnostics for a Cashfree authentication error', async () => {
  mockAxiosRequest.mockRejectedValue({
    isAxiosError: true,
    code: 'ERR_BAD_RESPONSE',
    response: {
      status: 503,
      data: {
        error: 'Cashfree credentials were rejected by the payment provider.',
        paymentSessionId: 'session_must_not_be_logged',
        customerEmail: 'customer@example.com',
      },
    },
  });
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});

  try {
    await expect(
      createOrder(customer, '56bb45db-a04c-4bc7-baa3-834a7ae18807'),
    ).rejects.toThrow('Cashfree credentials were rejected');

    expect(errorLog).toHaveBeenCalledTimes(1);
    const loggedMessage = errorLog.mock.calls[0][0];
    expect(loggedMessage).toContain('"status":503');
    expect(loggedMessage).toContain('Cashfree credentials were rejected');
    expect(loggedMessage).not.toContain('session_must_not_be_logged');
    expect(loggedMessage).not.toContain('customer@example.com');
  } finally {
    errorLog.mockRestore();
  }
});
