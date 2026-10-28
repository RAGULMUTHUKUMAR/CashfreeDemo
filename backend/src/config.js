const path = require('node:path');

function readConfig(environment = process.env) {
  const cashfreeEnvironment = environment.CASHFREE_ENV || 'SANDBOX';
  if (!['SANDBOX', 'PRODUCTION'].includes(cashfreeEnvironment)) {
    throw new Error('CASHFREE_ENV must be SANDBOX or PRODUCTION.');
  }

  const port = Number(environment.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }

  const databasePath = environment.DATABASE_PATH || './data/payments.sqlite';
  const cashfreeApiVersion = environment.CASHFREE_API_VERSION || '2026-01-01';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cashfreeApiVersion)) {
    throw new Error('CASHFREE_API_VERSION must use YYYY-MM-DD format.');
  }

  return {
    port,
    databasePath:
      databasePath === ':memory:' ? databasePath : path.resolve(databasePath),
    cashfreeEnvironment,
    cashfreeApiVersion,
    cashfreeReturnUrl: environment.CASHFREE_RETURN_URL || undefined,
    cashfreeClientId: environment.CASHFREE_CLIENT_ID,
    cashfreeClientSecret: environment.CASHFREE_CLIENT_SECRET,
  };
}

function hasCashfreeCredentials(config) {
  return Boolean(config.cashfreeClientId && config.cashfreeClientSecret);
}

module.exports = { readConfig, hasCashfreeCredentials };
