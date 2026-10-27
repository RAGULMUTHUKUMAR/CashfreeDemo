.DEFAULT_GOAL := help
SHELL := /bin/sh

GRADLEW := ./android/gradlew
BACKEND_URL ?= http://127.0.0.1:4000

.PHONY: help doctor install backend-env dev dev-api-check backend dev-backend metro health \
	mobile-test backend-test test lint backend-check check android android-debug \
	android-release-check android-release prod-check prod-backend-check \
	prod-backend prod-android prod clean clean-android clean-backend clean-metro

help: ## Show available development, production, and cleanup targets
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z0-9_.-]+:.*## / { printf "  %-24s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

doctor: ## Print required tool versions and connected Android devices
	@node --version
	@npm --version
	@java -version
	@printf 'ANDROID_HOME=%s\n' "$${ANDROID_HOME:-not set}"
	@adb devices -l

install: ## Install root and backend dependencies from their lockfiles
	npm ci
	npm ci --prefix backend

backend-env: ## Create backend/.env from the example only when it does not exist
	@test -f backend/.env || cp backend/.env.example backend/.env

dev: dev-api-check ## Print the three-terminal Android development workflow
	@printf 'Run each command in its own terminal:\n\n'
	@printf 'Terminal 1 (Metro):   make metro\n'
	@printf 'Terminal 2 (backend): make backend\n'
	@printf 'Terminal 3 (Android): npm run android\n\n'
	@printf 'Metro and backend stay running. The Android command builds, installs, launches, and then exits.\n'

dev-api-check: ## Ensure the development app uses a local/private HTTP backend
	@node -e 'const fs=require("node:fs"); const text=fs.readFileSync("src/config/environment.js","utf8"); const match=text.match(/export const API_BASE_URL = [\x27\x22]([^\x27\x22]+)[\x27\x22]/); if (!match) { console.error("Could not read API_BASE_URL."); process.exit(1); } const url=new URL(match[1]); const host=url.hostname; const local=host==="localhost" || host==="127.0.0.1" || host==="[::1]" || host==="10.0.2.2" || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host); if (url.protocol!=="http:" || !local) { console.error("Development requires a local/private HTTP API_BASE_URL; use make prod-check for production URLs."); process.exit(1); }'

backend: dev-api-check backend-env ## Start the backend in Cashfree Sandbox watch mode
	CASHFREE_ENV=SANDBOX npm run backend:dev

dev-backend: backend ## Backward-compatible alias for the backend development server

metro: ## Start the React Native Metro server
	npm start

health: ## Check the local backend health endpoint
	curl --fail --silent --show-error $(BACKEND_URL)/health

mobile-test: ## Run React Native JavaScript tests
	npm test -- --runInBand

backend-test: ## Run backend tests with mocked Cashfree responses
	npm run backend:test

test: mobile-test backend-test ## Run mobile and backend test suites

lint: ## Lint JavaScript and JSX
	npm run lint

backend-check: ## Parse-check backend JavaScript
	npm run backend:check

check: lint test backend-check ## Run lint, tests, and backend syntax checks

android: dev-api-check ## Patch the Cashfree SDK and build/install on the connected Android device
	npm run android

android-debug: dev-api-check ## Build the debug APK without installing it
	npm run android:build

android-release-check: ## Require HTTPS API URL and a non-debug release keystore
	@node -e 'const fs=require("node:fs"); const text=fs.readFileSync("src/config/environment.js","utf8"); const match=text.match(/export const API_BASE_URL = [\x27\x22]([^\x27\x22]+)[\x27\x22]/); if (!match || !match[1].startsWith("https://")) { console.error("Set API_BASE_URL in src/config/environment.js to the production HTTPS backend URL."); process.exit(1); }'
	@test -n "$${ANDROID_KEYSTORE_PATH:-}" || { echo 'Set ANDROID_KEYSTORE_PATH.' >&2; exit 1; }
	@test -f "$${ANDROID_KEYSTORE_PATH}" || { echo 'ANDROID_KEYSTORE_PATH must point to an existing keystore.' >&2; exit 1; }
	@node -e 'const path=require("node:path"); const key=process.env.ANDROID_KEYSTORE_PATH; if (!path.isAbsolute(key)) { console.error("ANDROID_KEYSTORE_PATH must be absolute."); process.exit(1); } if (path.resolve(key)===path.resolve("android/app/debug.keystore")) { console.error("The starter debug keystore cannot sign a production release."); process.exit(1); }'
	@test -n "$${ANDROID_KEYSTORE_PASSWORD:-}" || { echo 'Set ANDROID_KEYSTORE_PASSWORD in the environment.' >&2; exit 1; }
	@test -n "$${ANDROID_KEY_ALIAS:-}" || { echo 'Set ANDROID_KEY_ALIAS.' >&2; exit 1; }
	@test -n "$${ANDROID_KEY_PASSWORD:-}" || { echo 'Set ANDROID_KEY_PASSWORD in the environment.' >&2; exit 1; }

android-release: android-release-check ## Build signed release APK and Play Store AAB
	npm run patch:sdk
	$(GRADLEW) -p android :app:assembleRelease :app:bundleRelease

prod-backend-check: backend-env ## Require explicit Production mode and backend Cashfree credentials
	@cd backend && node -e 'require("dotenv").config(); const missing=["CASHFREE_CLIENT_ID","CASHFREE_CLIENT_SECRET"].filter((key)=>!process.env[key]); if (process.env.CASHFREE_ENV !== "PRODUCTION") missing.unshift("CASHFREE_ENV=PRODUCTION"); if (missing.length) { console.error("Production backend configuration is incomplete: " + missing.join(", ")); process.exit(1); }'

prod-backend: prod-backend-check ## Start the backend in explicit Production mode
	@cd backend && npm start

prod-check: android-release-check prod-backend-check ## Validate HTTPS, release signing, and Production backend configuration

prod-android: android-release ## Build production-signed Android artifacts

prod: prod-check prod-android ## Validate production configuration and build Android release artifacts

clean-android: ## Remove generated Android build outputs only
	$(GRADLEW) -p android clean

clean-backend: ## Remove ignored backend build output, preserving backend/data and backend/.env
	@if [ -d backend/dist ]; then rm -rf -- backend/dist; fi

clean-metro: ## Remove the project-local Metro cache, when present
	@if [ -d node_modules/.cache/metro ]; then rm -rf -- node_modules/.cache/metro; fi

clean: clean-android clean-backend clean-metro ## Clean generated build/cache files; preserve secrets and payment history