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

When the desktop app opens, it also starts the Expo mobile server in the
background with `npm run start -- --clear` from the mobile workspace. The app
prefers the repo's `mobile/` workspace when the packaged `.app` is still inside
this checkout, and falls back to the bundled `Contents/Resources/mobile` copy.
Node.js and npm must be installed on the Mac that runs the app.

To disable the automatic mobile server:

```bash
REMOTE_MOBILE_SERVER=0 npm run desktop:dev
```

To point the packaged app at a specific mobile checkout:

```bash
REMOTE_MOBILE_DIR=/path/to/remote-control/mobile open "desktop/release/mac/Mac Remote.app"
```

For a DMG and ZIP:

```bash
npm run desktop:dist:mac
```

Those files are created in `desktop/release/`.

This prototype is unsigned. On your own Mac, open it with right-click > **Open** the first time, then grant Accessibility permission in **System Settings > Privacy & Security > Accessibility**.

## Message Protocol

The mobile app sends JSON over WebSocket:

```ts
{ type: "authRequest", clientId: string, clientName: string, pairingToken?: string, deviceToken?: string }
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
  the phone reconnects with a saved device token.
- The shortcut commands are macOS-specific.
- The mobile app is pinned to Expo SDK 54 so it works with Expo Go `54.x`.
