const { z } = require('zod');

const indianPhone = /^(?:\+91[ -]?)?[6-9]\d{9}$|^0[6-9]\d{9}$/;

const createOrderSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().regex(indianPhone),
    amount: z
      .number()
      .finite()
      .min(1)
      .max(100000)
      .refine(value => Math.round(value * 100) === value * 100),
  })
  .strict();

const orderIdSchema = z.string().regex(/^cf_demo_[a-f0-9]{32}$/);

function normalizeIndianPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

module.exports = { createOrderSchema, orderIdSchema, normalizeIndianPhone };
