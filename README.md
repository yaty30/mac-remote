# Mac Remote

Mac Remote is a local-network remote-control application that lets an iPhone control a macOS or Windows computer through a companion Electron desktop client.

The project consists of:

- An Expo and React Native mobile app
- An Electron and TypeScript desktop host
- A shared TypeScript protocol package used by both clients
- Secure QR-code pairing and encrypted WebSocket application traffic

## Features

### Remote controls

- Large gesture-based trackpad
- Left click, double click, and right click
- Two-finger scrolling
- Pinch-to-zoom controls
- macOS workspace switching
- Windows window switching
- Mission Control and overview controls
- Remote keyboard and text input
- Browser back, forward, reload, and close-tab actions
- Media playback controls
- Brightness and volume controls based on host capabilities
- Sleep and restart actions

### Mobile experience

- QR-code pairing
- Trusted-device reconnection
- Multiple saved desktops
- Device switching without immediately dropping the active connection
- Customizable website shortcuts
- Haptic feedback
- Guided onboarding and in-app feature tour
- Connection, authentication, and latency states
- Host-aware controls for macOS and Windows

### Desktop experience

- Local WebSocket host
- Pairing QR display
- Connected-device and paired-device status
- Device revocation
- macOS Accessibility permission status
- Start-at-login support on macOS
- macOS and Windows packaging targets
- Optional automatic Expo development-server startup

## Architecture

```text
mac-remote/
├── desktop/
│   ├── auth/                  # Pairing and trusted-device authentication
│   ├── electron/              # Electron main process, preload, and desktop UI
│   ├── host/                  # macOS and Windows host adapters
│   ├── mouse-control/         # Mouse and keyboard automation
│   ├── websocket/             # Secure WebSocket server
│   └── test/                  # Desktop and socket integration tests
├── mobile/
│   ├── components/            # Shared mobile UI components
│   ├── features/
│   │   ├── connection/        # Pairing, saved devices, and connection state
│   │   ├── remote/            # Trackpad, keyboard, controls, and device switching
│   │   ├── settings/          # Remote preferences and host settings
│   │   └── shortcuts/         # Custom shortcut management
│   ├── navigation/            # Onboarding and application navigation
│   ├── screens/               # Top-level mobile screens
│   ├── websocket/             # Mobile socket and command sender
│   └── test/                  # Mobile logic tests
├── packages/
│   └── protocol/              # Shared messages, validation, and secure transport
├── scripts/                   # Workspace and autostart helpers
├── package.json
└── package-lock.json
```

## Technology Stack

### Mobile

- Expo SDK 54
- React Native
- React
- TypeScript
- React Navigation
- React Native Gesture Handler
- Expo Camera
- Expo Haptics
- AsyncStorage

### Desktop

- Electron
- TypeScript
- `ws`
- `@nut-tree-fork/nut-js`
- Electron Builder

### Shared protocol and security

- Shared TypeScript message definitions
- Runtime message validation
- XChaCha20-Poly1305 authenticated encryption
- HKDF-SHA256 session-key derivation
- Versioned protocol and encryption negotiation
- Replay and out-of-order message protection

## Requirements

- Node.js `20.19.4` or newer
- Node.js 22 LTS recommended
- npm
- A macOS or Windows desktop
- An iPhone on the same local network
- Xcode for native iOS development or App Store builds
- An Apple Developer account for TestFlight or App Store distribution

## Installation

Install all workspaces from the repository root:

```bash
git clone https://github.com/yaty30/mac-remote.git
cd mac-remote
npm install
```

## Development

### Start desktop and mobile together

```bash
npm run dev
```

This starts:

- The Electron desktop host
- The Expo mobile development server with a cleared Metro cache

### Start the desktop only

```bash
npm run desktop:dev
```

### Start the mobile app only

```bash
npm run mobile:start
```

The Expo server is exposed on the local network so the phone and desktop can communicate over the same Wi-Fi network.

## First-Time Pairing

1. Start the desktop application.
2. Start the mobile application on the iPhone.
3. Open the QR scanner in the mobile app.
4. Scan the pairing QR displayed by the desktop client.
5. Wait for the connection state to change to **Connected**.
6. Grant the required desktop permissions when prompted.

The pairing QR contains a short-lived, single-use token. After successful pairing, the phone can reconnect as a trusted device without rescanning the QR code.

## macOS Permissions

macOS requires Accessibility permission before an application can control the mouse or keyboard.

1. Open **System Settings**.
2. Go to **Privacy & Security > Accessibility**.
3. Enable the Electron app or the packaged Mac Remote application.
4. Fully quit and restart the desktop app after changing the permission.

During development, the relevant executable is commonly:

```text
node_modules/electron/dist/Electron.app
```

Without Accessibility permission, macOS may block mouse movement, clicks, keyboard input, workspace switching, and other system actions.

### Mission Control shortcuts

Workspace switching uses the configured macOS Mission Control shortcuts. Check:

```text
System Settings
→ Keyboard
→ Keyboard Shortcuts
→ Mission Control
```

Make sure **Move left a space** and **Move right a space** are enabled.

## Windows Notes

Windows builds use the Windows host adapter and native automation dependencies.

Build Windows packages on Windows so Electron and native dependencies are compiled for the correct platform.

Windows SmartScreen may warn about unsigned development builds.

## Security Model

Mac Remote uses an application-level secure transport over a local WebSocket connection.

### Pairing

- Pairing QR codes contain short-lived, single-use tokens.
- The desktop rotates pairing tokens before expiration.
- A small number of previous unexpired tokens remain valid so a QR does not become unusable while it is being scanned.
- Consumed pairing tokens are tracked temporarily to reject replay attempts.
- Paired devices can be revoked from the desktop client.

### Trusted-device authentication

After pairing, the mobile client reconnects by proving possession of its trusted-device credential instead of sending the stored credential directly over the socket.

The authentication handshake includes:

- Client identity
- Client nonce
- Server nonce
- Protocol version
- Encryption version
- A proof derived from the pairing or trusted-device secret

### Encrypted application traffic

After authentication:

- Client-to-server and server-to-client keys are derived separately.
- Application messages are encrypted with XChaCha20-Poly1305.
- Envelope metadata is authenticated.
- Sequence numbers reject replayed, stale, or out-of-order messages.
- Plaintext application messages are rejected once secure mode begins.
- Session keys are cleared when the connection is closed.

The underlying connection still uses `ws://` on the local network. Application payloads are encrypted, but network metadata such as IP addresses, ports, packet timing, and connection size is not hidden.

## Shared Message Protocol

The mobile and desktop applications import their protocol definitions from:

```text
packages/protocol
```

The package contains:

- Authentication messages
- Remote-control commands
- Host-state messages
- Protocol and encryption versions
- Runtime validation
- Secure transport helpers
- Protocol-focused tests

Representative application messages include:

```ts
{ type: "moveMouse", dx: number, dy: number }
{ type: "leftClick" }
{ type: "doubleClick" }
{ type: "rightClick" }
{ type: "scroll", dx: number, dy: number }
{ type: "zoom", direction: "in" | "out" }
{ type: "switchWorkspace", direction: "left" | "right" }
{ type: "switchWindow", direction: "next" | "previous" }
{ type: "showOverview" }
{ type: "setBrightness", value: number }
{ type: "setVolume", value: number }
{ type: "typeText", text: string }
{ type: "websiteShortcut", name: string, url: string }
{ type: "requestHostState" }
{ type: "ping", id: string }
{ type: "pong", id: string }
```

All non-authentication application messages are encrypted after secure mode is established.

## Configuration

### WebSocket port

The desktop host uses port `8787` by default:

```bash
REMOTE_CONTROL_PORT=9000 npm run desktop:dev
```

### Disable automatic Expo startup

The desktop development process normally starts the mobile Expo server automatically.

Disable it with:

```bash
REMOTE_MOBILE_SERVER=0 npm run desktop:dev
```

### Use a separate mobile checkout

```bash
REMOTE_MOBILE_SERVER=1 \
REMOTE_MOBILE_DIR=/path/to/mac-remote/mobile \
npm run desktop:dev
```

### Use an existing Expo server

```bash
REMOTE_MOBILE_SERVER=0 \
REMOTE_EXPO_URL=exp://192.168.1.25:8081 \
npm run desktop:dev
```

### Override the desktop display name

```bash
REMOTE_DEVICE_NAME="Living Room Mac" npm run desktop:dev
```

### Legacy raw-token authentication

Development builds may allow the legacy raw-token flow for compatibility. Packaged builds disable it by default.

Override it explicitly with:

```bash
REMOTE_LEGACY_RAW_TOKEN_AUTH=0 npm run desktop:dev
```

or:

```bash
REMOTE_LEGACY_RAW_TOKEN_AUTH=1 npm run desktop:dev
```

The proof-based flow should be used for production builds.

## Testing

Run the complete verification command from the repository root:

```bash
npm run verify
```

This runs:

- Shared protocol tests
- Mobile logic tests
- Desktop tests
- TypeScript type-checking for all workspaces

Run only type-checking:

```bash
npm run typecheck
```

Run the desktop test script:

```bash
npm test
```

### Current test coverage

The repository includes tests for:

- Protocol validation
- Message clamping and normalization
- Secure key derivation
- Two-way encryption and decryption
- Modified-ciphertext rejection
- Replay and sequence rejection
- Single-use pairing tokens
- Trusted-device reconnection
- QR-token rotation
- Device revocation
- Encrypted post-authentication WebSocket traffic
- Navigation and onboarding logic
- Remote-control refactoring logic

Real-device iPhone-to-Electron pairing should still be included in the manual release smoke test.

## Build the Desktop App

Native desktop packages must be built on their target operating system.

### macOS unpacked application

```bash
npm run desktop:pack:mac
```

Output:

```text
desktop/release/mac/Mac Remote.app
```

### macOS DMG and ZIP

```bash
npm run desktop:dist:mac
```

### Windows unpacked application

```bash
npm run desktop:pack:win
```

Output:

```text
desktop/release/win-unpacked/
```

### Windows installer and ZIP

```bash
npm run desktop:dist:win
```

Desktop development builds are currently unsigned.

For public macOS distribution, sign and notarize the application. For public Windows distribution, sign the installer with a trusted code-signing certificate.

## Start on macOS Login

Install the macOS LaunchAgent:

```bash
npm run autostart:install
```

Remove it:

```bash
npm run autostart:uninstall
```

Logs are written to:

```text
~/Library/Logs/local.remote-control.dev.out.log
~/Library/Logs/local.remote-control.dev.err.log
```

## Mobile Builds

Build profiles are defined in `eas.json`.

### Development build

```bash
eas build --platform ios --profile development
```

### Android internal APK

```bash
eas build --platform android --profile preview
```

### Production build

```bash
eas build --platform ios --profile production
```

or:

```bash
eas build --platform android --profile production
```

Before a public release, replace the current local bundle identifiers with identifiers owned by your developer account.

## Useful Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start desktop and mobile development processes |
| `npm run desktop:dev` | Build and start the Electron desktop client |
| `npm run mobile:start` | Start the Expo development server |
| `npm run desktop:pack:mac` | Create an unpacked macOS application |
| `npm run desktop:dist:mac` | Create macOS DMG and ZIP packages |
| `npm run desktop:pack:win` | Create an unpacked Windows application |
| `npm run desktop:dist:win` | Create Windows installer and ZIP packages |
| `npm run typecheck` | Type-check all workspaces |
| `npm run verify` | Run all tests and type-checks |
| `npm run autostart:install` | Install the macOS development LaunchAgent |
| `npm run autostart:uninstall` | Remove the macOS development LaunchAgent |

## Current Limitations

- The desktop application and installers are unsigned.
- Public mobile bundle identifiers have not been configured.
- Linux desktop hosts are not supported.
- The application is intended for local-network use.
- Some system controls depend on the host operating system and detected display capabilities.
- Trusted-device credentials should be moved to OS-backed secure storage before a public production release.
- Automated real-device end-to-end pairing coverage has not yet been added.
- The current product metadata should be normalized consistently under the Mac Remote name.

## Release Checklist

- [ ] Use owned iOS and Android application identifiers.
- [ ] Store trusted-device credentials in OS-backed secure storage.
- [ ] Sign and notarize the macOS application.
- [ ] Sign the Windows installer.
- [ ] Add continuous integration for `npm run verify`.
- [ ] Add an automated Expo/Hermes-to-Electron pairing test.
- [ ] Test first-time pairing and trusted-device reconnection on a physical iPhone.
- [ ] Run macOS, Windows, iOS, and Android smoke tests.
- [ ] Verify accessibility labels, focus order, Dynamic Type, and contrast.
- [ ] Normalize package versions and product branding.
- [ ] Confirm production builds disable legacy raw-token authentication.

## Status

Mac Remote is currently an early-beta personal project. Core remote-control features, secure pairing, encrypted communication, device switching, packaging, and automated protocol tests are implemented.

Additional production hardening, signing, continuous integration, secure credential storage, and real-device end-to-end testing remain before a public release.
