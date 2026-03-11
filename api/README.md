# HomeFixSolution Mobile API Pack (Android)

This folder is the handoff package for Android Studio integration.

## What to share with Android team

- `google-services.json` from Firebase Console (Android app config, client-safe)
- Firestore collection schema and required fields
- Firestore security rules behavior
- Auth flow behavior (email/password + email verification)
- Request status lifecycle (`pending`, `confirmed`, `cancelled`, `completed`)

## What NOT to share

- Service account JSON
- Admin SDK private keys
- Any `.env` secret values
- Twilio or third-party secret tokens

## Current backend status

- Firebase Auth: enabled (email/password + email verification flow)
- Firestore: used for users, addresses, requests
- Cloud Functions: no active mobile callable contract documented for app flow

## Android setup quick steps

1. Add Firebase project app in Firebase Console for your Android package name.
2. Download `google-services.json` and place it in Android `app/`.
3. Add Firebase BOM + SDKs (Auth + Firestore) in Gradle.
4. Implement data operations using `api/firestore-schema.md`.
5. Follow access constraints in `api/security-rules-summary.md`.

## Files in this folder

- `integration-guide.md`
- `firestore-schema.md`
- `security-rules-summary.md`
- `examples/request-create.json`
- `examples/user-profile-update.json`
- `examples/address-create.json`
