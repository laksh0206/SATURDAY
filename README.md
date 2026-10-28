# Nova Companion

A phone-ready personal AI companion built on **Gemini Live**. It has a simple animated face, two-way voice, four visual behaviour modes, local editable memory, and a private server that protects your permanent Gemini API key.

## What is built

- Animated eyes, blinking, talking mouth, and hand gestures
- Sleep, Active, Calm, and red Hyper modes with different colors and animation energy
- Two-way Gemini Live voice using native mobile microphone capture and streamed PCM playback
- Interruption support: Nova clears its reply when you speak over it
- User-approved memory saved on the phone and always editable
- A private token server that creates restricted, short-lived Gemini Live tokens
- Android/iPhone configuration and APK build settings

## First: rotate the API key that was pasted into chat

That key must be treated as exposed. In Google AI Studio, revoke it and create a replacement. Never paste the replacement into chat or into the phone application.

Put the replacement only in a local file called `server/.env`:

```env
GEMINI_API_KEY=your_new_key_here
PORT=8787
```

The app never contains this permanent key. Your server exchanges it for a short-lived, restricted token; Gemini recommends ephemeral tokens for direct mobile Live API connections. [Gemini’s official guidance](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)

## Run locally

1. Install Node.js LTS on your development computer. This workspace also contains a portable Node build for the current build session.
2. Enable the package manager once:

   ```powershell
   corepack enable
   ```

3. Install the server packages and start the token server:

   ```powershell
   cd server
   pnpm install
   pnpm dev
   ```

4. In the project root, install mobile packages and create the native Android project:

   ```powershell
   pnpm install
   npx expo prebuild
   npx expo run:android
   ```

5. Find your computer’s Wi-Fi address, for example `192.168.1.24`.
6. On the phone app’s **Settings** page, set the server URL to `http://192.168.1.24:8787`.
7. Tap **Talk to Nova** and grant microphone permission.

For this local test, the phone and computer must be on the same Wi-Fi. The app needs a development build—not Expo Go—because it uses native audio capture and low-latency playback.

## Create an Android APK

1. Create a free Expo account.
2. Change the Android package identifier in `app.json` to one you own, such as `com.yourname.nova`.
3. Run:

   ```powershell
   npx eas-cli@latest login
   npx eas-cli@latest build:configure
   npx eas-cli@latest build --profile preview --platform android
   ```

4. Open the build link on Android and install the generated APK.

Use the `production` profile to make an Android App Bundle for Google Play. iPhone builds use `--platform ios`, TestFlight, and an Apple Developer account.

## What Gemini Live does here

```text
Phone microphone → 16 kHz PCM audio → Gemini Live WebSocket
                                      ↓
Face reacts: listening → thinking → speaking
                                      ↓
24 kHz PCM reply → native phone speaker
```

The Gemini Live API uses a stateful WebSocket connection, receives raw 16 kHz PCM audio, and returns 24 kHz PCM audio. [Official Live API guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)

## Before public release

- Add sign-in and per-user authentication to the token server.
- Deploy the server over HTTPS; do not use the local Wi-Fi URL for a public app.
- Add a database-backed rate limit, privacy policy, delete-account flow, and support contact.
- Set a strict spend limit in Google AI Studio.
- Keep long-running background listening off by default.
- Require confirmation for messages, calendar changes, purchases, or data deletion.

Nova is designed as an AI companion interface, not as a human or medical professional.
