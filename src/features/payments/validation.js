const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+91[ -]?)?[6-9]\d{9}$|^0[6-9]\d{9}$/;
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function validatePaymentForm(values) {
  const errors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const phone = values.phone.trim();
  const amountText = values.amount.trim();
  const amount = Number(amountText);

  if (!name) {
    errors.name = 'Enter the customer name.';
  } else if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (!PHONE_PATTERN.test(phone)) {
    errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  }
  if (
    !AMOUNT_PATTERN.test(amountText) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    errors.amount = 'Enter a positive amount with up to 2 decimal places.';
  } else if (amount > 100000) {
    errors.amount = 'The demo limit is Rs 1,00,000.';
  }

  return {
    errors,
    value: errors.amount
      ? undefined
      : {
          name,
          email,
          phone,
          amount: Math.round(amount * 100) / 100,
        },
  };
}
