# iPhone to iMac Remote Control MVP

This prototype lets an iPhone control an iMac over local Wi-Fi:

- Move the mouse from a large React Native trackpad.
- Tap the trackpad to left click.
- Launch Netflix, YouTube, and Spotify from shortcut buttons.
- Run a local Electron desktop app that hosts the WebSocket server.

## Project Structure

```text
remote-control/
├── desktop/
│   ├── electron/
│   ├── websocket/
│   └── mouse-control/
└── mobile/
    ├── screens/
    ├── components/
    ├── websocket/
    └── gestures/
```

## Desktop Setup

The desktop app is an Electron + TypeScript app. It starts a WebSocket server on port `8787` and displays the iMac's local IPv4 addresses.

Use Node.js `20.19.4` or newer for the Expo SDK 54 dependency set. Node `22` LTS is recommended.

The public npm install uses `@nut-tree-fork/nut-js`, the installable community fork of nut.js. The official `@nut-tree/nut-js` package is now distributed from nut.js's private registry; if you have a paid nut.js registry token, you can switch the dependency and import back to `@nut-tree/nut-js`.

```bash
cd remote-control/desktop
npm install
npm run dev
```

On macOS, grant the Electron app accessibility permissions:

1. Open **System Settings**.
2. Go to **Privacy & Security > Accessibility**.
3. Add and enable the Electron app used to launch it.

In dev mode, the app is usually:

```text
remote-control/node_modules/electron/dist/Electron.app
```

If Terminal is already enabled but mouse movement still prints Accessibility warnings, add `Electron.app` too. After changing Accessibility permissions, fully quit and restart the desktop app.

Without Accessibility permission, macOS may block mouse movement and clicks.

Desktop switching uses macOS `Ctrl+Left Arrow` and `Ctrl+Right Arrow`. If the arrow buttons do not switch fullscreen Spaces, enable **System Settings > Keyboard > Keyboard Shortcuts > Mission Control > Move left a space / Move right a space**.

## Mobile Setup

The mobile app is a React Native + TypeScript Expo app.

```bash
cd remote-control/mobile
npm install
npx expo install --fix
npm run start
```

Open the app on your iPhone with Expo Go, or run it with an iOS simulator. Enter the desktop IP shown in the Electron window and tap **Connect**.

## Example Startup Flow

1. Start the desktop app:

   ```bash
   cd remote-control/desktop
   npm run dev
   ```

2. Note the displayed IP address, for example `192.168.1.25`.
3. Start the mobile app:

   ```bash
   cd remote-control/mobile
   npm run start
   ```

4. On iPhone, enter `192.168.1.25` and connect.

## Package Desktop App For Mac

Build the macOS app on the iMac, not from Windows, because Electron and nut.js need macOS native binaries. The packaging script intentionally refuses to run on Windows so it does not create a broken Mac app.

```bash
cd remote-control
npm install
npm run desktop:pack:mac
```

The unpacked app is created under:

```text
desktop/release/mac/Mac Remote.app
```

When the desktop app runs in development, it also starts the Expo mobile server
in the background with `npm run start -- --clear` from the mobile workspace and
shows the Expo QR code. Packaged desktop apps do not start Expo and do not show
the Expo QR by default; they show only the pairing QR for the mobile app.

To disable the automatic mobile server:

```bash
REMOTE_MOBILE_SERVER=0 npm run desktop:dev
```

To force Expo tools back on, for example when testing a packaged desktop build
with a separate mobile checkout:

```bash
REMOTE_MOBILE_SERVER=1 REMOTE_MOBILE_DIR=/path/to/remote-control/mobile open "desktop/release/mac/Mac Remote.app"
```

To show an Expo QR for an already-running Expo server without auto-starting it:

```bash
REMOTE_MOBILE_SERVER=0 REMOTE_EXPO_URL=exp://192.168.1.25:8081 npm run desktop:dev
```

For a DMG and ZIP:

```bash
npm run desktop:dist:mac
```

Those files are created in `desktop/release/`.

This prototype is unsigned. On your own Mac, open it with right-click > **Open** the first time, then grant Accessibility permission in **System Settings > Privacy & Security > Accessibility**.

## Package Desktop App For Windows

Build the Windows app on Windows so Electron and nut.js use Windows native binaries.

```bash
cd remote-control
npm install
npm run desktop:pack:win
```

The unpacked app is created under:

```text
desktop/release/win-unpacked/
```

For an NSIS installer and ZIP:

```bash
npm run desktop:dist:win
```

Those files are created in `desktop/release/`.

This prototype is unsigned. Windows SmartScreen may warn until the installer is code-signed with a trusted certificate.

## Mobile Release Builds

The mobile app can still run through Expo Go for development. Release metadata is defined in `mobile/app.json` and `eas.json`:

- iOS bundle identifier: `local.remote-control.mobile`
- Android package: `local.remotecontrol.mobile`
- Android release build profile: `eas build --platform android --profile production`
- Android internal APK build profile: `eas build --platform android --profile preview`

For a real public release, replace the `local.*` identifiers with bundle IDs/package names that you control before submitting to the stores. iOS App Store and TestFlight distribution require an Apple Developer account.

## Message Protocol

The mobile app sends JSON over WebSocket:

```ts
{ type: "authChallenge", nonce: string }
{ type: "authRequest", clientId: string, clientName: string, pairingTokenId?: string, pairingTokenProof?: string, deviceTokenProof?: string }
{ type: "authAccepted", deviceToken?: string, paired: boolean }
{ type: "authRejected", reason: "missingCredentials" | "pairingTokenExpired" | "pairingTokenInvalid" | "pairingTokenUsed" | "deviceNotTrusted" }
{ type: "moveMouse", dx: number, dy: number }
{ type: "leftClick" }
{ type: "shortcut", shortcut: "netflix" | "disney" | "amazon" | "youtube" | "spotify" }
{ type: "typeText", text: string }
{ type: "pressKey", key: "backspace" | "enter" }
{ type: "adjustBrightness", delta: -1 | 1 }
{ type: "setVolume", value: number }
{ type: "ping", id: string }
{ type: "pong", id: string }
```

## Configuration

Pointer sensitivity is controlled from the mobile app settings. The desktop
host treats incoming pointer deltas as already scaled by the mobile app.

The WebSocket port defaults to `8787` and can be changed with:

```bash
REMOTE_CONTROL_PORT=9000 npm run dev
```

## Start On Mac Login

Register a macOS LaunchAgent to run `npm run dev` from this repo whenever your user logs in:

```bash
npm run autostart:install
```

To remove it:

```bash
npm run autostart:uninstall
```

LaunchAgent logs are written to `~/Library/Logs/local.remote-control.dev.out.log` and `~/Library/Logs/local.remote-control.dev.err.log`.

## Notes

- This is intended only for trusted home Wi-Fi.
- Pairing QR codes include a short-lived single-use token. After first pairing,
  the phone reconnects by proving it has a saved device token without sending
  the raw token over the socket.
- The shortcut commands are macOS-specific.
- The mobile app is pinned to Expo SDK 54 so it works with Expo Go `54.x`.

## Release Checklist

- Replace `local.*` app identifiers with owned production identifiers.
- Sign and notarize the macOS app before distributing outside your own Mac.
- Sign the Windows installer to reduce SmartScreen warnings.
- Build mobile release artifacts through EAS or native IDE tooling.
- Keep the Expo QR/mobile dev server enabled only for development builds when moving to a production desktop app.
- Run `npm test`, desktop and mobile typechecks, and a manual macOS/Windows/iOS/Android smoke test before release.

## Encryption Plan

Current auth uses a challenge-response proof so the saved device token is not
sent raw over the LAN during normal reconnect. The WebSocket transport itself is
still `ws://`, so the next security layer should be app-level encryption:

1. Keep `authChallenge`, pairing token proof, and device token proof as the
   readable handshake.
2. Add a client nonce to the auth proof response and derive a per-session key
   from the token hash, desktop nonce, client nonce, and protocol version.
3. Add a new encrypted envelope message, for example
   `{ type: "encrypted", nonce, sequence, payload }`.
4. Encrypt control messages after auth using authenticated encryption such as
   XChaCha20-Poly1305 or AES-GCM from a vetted cross-platform crypto package.
5. Reject replayed or out-of-order encrypted command sequence numbers.
6. Keep `ping`, `pong`, `authChallenge`, `authRequest`, and `authRejected`
   readable so connection setup and latency checks remain simple.

This avoids self-signed TLS certificate trust problems on iOS/Android while
still protecting command payloads on the local network.
