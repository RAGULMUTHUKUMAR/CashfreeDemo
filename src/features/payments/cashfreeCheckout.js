import { CFPaymentGatewayService } from 'react-native-cashfree-pg-sdk';
import {
  CFDropCheckoutPayment,
  CFEnvironment,
  CFPaymentComponentBuilder,
  CFPaymentModes,
  CFSession,
  CFThemeBuilder,
} from 'cashfree-pg-api-contract';

export function registerCheckoutCallbacks(callbacks) {
  CFPaymentGatewayService.setCallback(callbacks);
}

export function removeCheckoutCallbacks() {
  CFPaymentGatewayService.removeCallback();
}

export function launchCheckout(paymentSessionId, orderId, environment) {
  if (!paymentSessionId || !orderId) {
    throw new Error('Cashfree requires a new payment session and order ID.');
  }

  const session = new CFSession(
    paymentSessionId,
    orderId,
    environment === 'PRODUCTION'
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX,
  );
  const components = new CFPaymentComponentBuilder()
    .add(CFPaymentModes.CARD)
    .add(CFPaymentModes.UPI)
    .add(CFPaymentModes.NB)
    .add(CFPaymentModes.WALLET)
    .add(CFPaymentModes.PAY_LATER)
    .build();
  const theme = new CFThemeBuilder()
    .setNavigationBarBackgroundColor('#17211b')
    .setNavigationBarTextColor('#ffffff')
    .setButtonBackgroundColor('#c7f36b')
    .setButtonTextColor('#17211b')
    .setBackgroundColor('#ffffff')
    .setPrimaryTextColor('#17211b')
    .setSecondaryTextColor('#59645c')
    .build();

  CFPaymentGatewayService.doPayment(
    new CFDropCheckoutPayment(session, components, theme),
  );
}
