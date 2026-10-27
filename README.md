
# CashfreeDemo

An Android-only React Native payment integration demo. The app creates an order through an Express backend, launches Cashfree Drop Checkout with a fresh payment session, and displays only the status verified by the backend.

## Architecture

```text
React Native Android app
	-> POST /api/payments/orders
	-> Express validates input and generates an order ID
	-> Cashfree Node SDK creates the order
	<- order ID and fresh payment_session_id
	-> Cashfree React Native SDK opens Drop Checkout
	-> GET /api/payments/orders/:orderId
	-> Backend fetches the order and payments directly from Cashfree
	<- normalized server-verified payment state
```

The SDK callback is recorded only as a checkout event. It is not proof of payment. The app asks the backend to verify the order after either callback and provides a manual verification action for pending or unavailable results. The backend stores order ID, amount, status, and timestamp in SQLite; it does not persist customer contact details or checkout session IDs.

## Stack

- React Native 0.88.0 and React 19.3.0, using JavaScript/JSX
- Cashfree React Native SDK 2.5.1 and API contract 2.2.0
- Node.js 22.13 or newer, Express 5.1.0, Cashfree Node SDK 6.0.6
- Node's built-in SQLite module (`node:sqlite`)
- Android SDK 37 / min SDK 24 in the existing React Native template

The Cashfree native module is autolinked by React Native. The app uses the SDK's Drop Checkout callback API and does not add payment secrets or Cashfree-specific Android permissions.

## Prerequisites

- Node.js 22.13 or newer and npm
- Java 17
- Android Studio or Android SDK platform/build tools compatible with the project's Gradle setup
- Android emulator or a USB/network-connected Android device with USB debugging enabled
- Cashfree merchant Sandbox credentials for creating real Sandbox sessions

## Install

From the repository root:

```sh
npm ci
npm ci --prefix backend
```

The checked-in root and backend lockfiles pin the JavaScript dependencies. Before building, `patch-package` applies the checked-in Cashfree SDK patch that removes its native debug log of the payment session payload.

## Backend setup

Create the local environment file:

```sh
cp backend/.env.example backend/.env
```

Set these backend-only values in `backend/.env`:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `4000` |
| `DATABASE_PATH` | SQLite database file | `./data/payments.sqlite` |
| `CASHFREE_ENV` | `SANDBOX` or `PRODUCTION` | `SANDBOX` |
| `CASHFREE_CLIENT_ID` | Cashfree client ID | unset |
| `CASHFREE_CLIENT_SECRET` | Cashfree client secret | unset |

Missing credentials are reported by `/health`, and order creation returns a clear configuration error. Production mode is never selected unless `CASHFREE_ENV=PRODUCTION` is explicitly set.

Start the backend from the repository root:

```sh
npm run backend:dev
```

Check it with `curl http://localhost:4000/health`. The backend binds to `0.0.0.0` so a physical device on the same trusted development network can reach it.

## Android setup and run

Install root dependencies first, then start Metro in one terminal:

```sh
npm start
```

In a second terminal, build and launch the app:

```sh
npm run android
```

Or build a debug APK without launching it:

```sh
npm run android:build
```

## Make targets

Run `make help` to list the project commands. Development uses three terminals:

1. `make metro` starts Metro and stays running.
2. `make backend` starts the backend in Cashfree Sandbox mode and stays running.
3. `npm run android` builds, installs, and launches the app; the command then exits while the app runs on the connected device.

`make dev` checks the local API URL and prints these commands; it does not combine the long-running processes into one terminal. `make check` runs lint, tests, and backend syntax checks; `make android-debug` builds without installing. `make clean` removes only Android build outputs, ignored backend `dist`, and the project-local Metro cache. It deliberately preserves `backend/.env`, `backend/data`, `node_modules`, and signing material.

Production targets are gated. Set `API_BASE_URL` in `src/config/environment.js` to an HTTPS endpoint, configure a production keystore through `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`, and set backend `.env` to `CASHFREE_ENV=PRODUCTION` with both Cashfree credentials. Then run `make prod-check` or `make prod`. Signing secrets are read from the environment and are never printed. `make prod` creates a signed APK and Android App Bundle; it does not deploy the backend or change Cashfree credentials for you. `make prod-backend` starts the separately configured production backend.

The app's backend base URL is in `src/config/environment.js` (currently set to this development computer's LAN address for the attached physical device):

- Android Emulator: use `http://10.0.2.2:4000`
- Physical device: use the development computer's reachable LAN IP, for example `http://192.168.1.20:4000`; keep the device and computer on a reachable network

The default HTTP URL is for local development only. Do not expose the backend or use cleartext HTTP on an untrusted network. A deployed backend must use HTTPS.

## Payment flow

1. The form validates name, email, Indian mobile number, and an INR amount from Rs 1.00 to Rs 1,00,000.00.
2. The backend validates the request again, generates a unique order ID, and creates the order with Cashfree's server SDK.
3. Only the order ID, amount, timestamp, and fresh `payment_session_id` are returned to the app. The mobile app never receives server credentials.
4. The Android app creates a Cashfree `CFSession` and launches Drop Checkout.
5. On `onVerify` or `onError`, the app queries its backend. The backend checks the order and fetches its payment records directly from Cashfree.
6. Only a Cashfree payment status of `SUCCESS` becomes a confirmed success. `USER_DROPPED`/`CANCELLED`, failed, pending, and unverifiable states remain distinct.

The backend endpoints are `GET /health`, `POST /api/payments/orders`, `GET /api/payments/orders/:orderId`, and `GET /api/payments/orders`. Payment endpoints use request validation, Helmet headers, a JSON body-size limit, a per-IP rate limit, and Cashfree API timeouts. History is limited to the latest 50 records.

## Cashfree Sandbox

Use Sandbox credentials from the Cashfree merchant dashboard and keep `CASHFREE_ENV=SANDBOX`. The backend uses the matching Cashfree environment for order creation and verification. Use Cashfree's Sandbox payment details from its official documentation; automated tests mock the Cashfree SDK and never initiate charges.

Official references:

- [Cashfree React Native integration](https://www.cashfree.com/docs/payments/online/mobile/react-native)
- [Cashfree Android integration](https://www.cashfree.com/docs/payments/online/mobile/android)
- [Cashfree Node.js SDK](https://github.com/cashfree/cashfree-pg-sdk-nodejs)

## Tests and checks

```sh
npm test -- --runInBand
npm run backend:test
npm run backend:check
npm run lint
./android/gradlew -p android :app:assembleDebug
```

Mobile tests cover form validation and payment-state labels. Backend tests cover validation, new order/session creation, Cashfree failures, status verification, unknown IDs, and history. Tests use mock Cashfree responses and an in-memory SQLite database.

## Troubleshooting

- **Backend unavailable in the app:** confirm `npm run backend:dev` is running and `GET /health` responds. The Android emulator must use `10.0.2.2`, not `localhost`.
- **Physical device cannot connect:** use the computer's reachable LAN IP in `src/config/environment.js`, allow the development port on the host firewall, and keep both devices on the same network.
- **Credentials missing:** set both backend Cashfree credential variables, then restart the backend. Never put the secret in the app.
- **Cashfree native module not found:** reinstall root dependencies, then rebuild the Android app; restarting Metro alone does not relink native code.
- **Android build fails after SDK changes:** use the checked-in Gradle wrapper and Java 17; do not independently upgrade Gradle, Kotlin, or the Android Gradle Plugin.
- **Node SQLite warning:** Node 22 currently marks `node:sqlite` experimental. This demo uses it to avoid a native package build step.

## Security notes

- Cashfree client secrets must stay in `backend/.env`, which is ignored by Git.
- Do not log client secrets, authorization headers, payment session IDs, or customer data.
- Do not store card details, UPI PINs, or payment credentials.
- SDK callbacks are not authoritative; only server-side Cashfree verification can report success.
- This sample has no user authentication and is for local Sandbox demonstrations, not production deployment. Add proper user authentication, authorization, HTTPS, durable operational monitoring, and payment webhook handling before production use.

## Platform support

Android is the only implemented and supported target. iOS is not configured for Cashfree or supported by this demo; any iOS directory present is from the original React Native template and has not been modified for payment processing.

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
