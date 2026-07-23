# Mac Remote

Mac Remote is a local-network remote control for a macOS or Windows computer. An
Expo/React Native phone app connects to an Electron desktop host over the local
Wi-Fi network, pairs by scanning a QR code, and sends authenticated, encrypted
control commands.

The product runs without a cloud service or user account. The desktop performs
all mouse, keyboard, media, display, power, and shortcut actions on the host
computer.

## Implemented features

### Phone app

- Pair with a desktop by scanning its QR code.
- Save multiple desktops, switch between them, rename them, and remove them.
- Reconnect to a previously paired desktop without scanning a new QR code.
- Use a trackpad with pointer movement, single click, double click, two-finger
  right click, scrolling, pinch zoom, and three-finger workspace switching.
- Adjust pointer sensitivity and scrolling direction per saved desktop.
- Type text remotely, paste phone clipboard text, move the caret, press common
  keys, and run editing, browser, tab, and media commands.
- Switch workspaces and windows and open the host's overview interface.
- Read and adjust host brightness and output volume when the active display and
  operating system expose those controls.
- Sleep or wake the macOS display, suspend Windows, and restart the host.
- Launch Netflix, YouTube, Disney+, Prime Video, and Spotify.
- Create, edit, and remove website shortcuts, including custom icons
  selected from the phone's photo library.
- Show connection status and measured WebSocket latency.
- Persist onboarding, tour state, saved desktops, shortcuts, and per-device
  settings locally on the phone.

### Desktop app

- Listen for phone connections on all local interfaces, on port `8787` by
  default.
- Display a rotating pairing QR code, LAN addresses, connection health,
  platform capabilities, active-display information, and latency.
- List paired phones and disconnect or forget them.
- Show macOS Accessibility status and open the relevant System Settings page.
- Enable or disable the source-development LaunchAgent on macOS.
- In development builds, start the Expo server and show a separate Expo QR code
  by default.

## Supported platforms

The desktop host supports:

- macOS (`darwin`)
- Windows (`win32`)

Linux is rejected at startup because no Linux host adapter is implemented.
Desktop packages must be built on their target operating system because the
mouse and keyboard dependency includes native binaries.

The phone app is configured for:

- iOS phones; iPad support is disabled
- Android phones

The interface is portrait-oriented. A web start script exists for Expo
development, but web is not configured or shipped as a supported release
target.

## Platform behavior

macOS control uses nut.js plus native system tools and AppleScript. Mouse and
keyboard control requires Accessibility permission. Workspace switching depends
on the macOS Mission Control shortcuts being enabled. Website shortcuts open in
Google Chrome; the Prime Video and Spotify presets expect those applications to
be installed.

Windows control uses nut.js, a PowerShell `SendInput` helper for relative mouse
movement, WMI for supported internal-display brightness controls, Core Audio
through an embedded PowerShell helper, and standard Windows shell commands.
Website shortcuts use the system URL handler.

The active display is the display nearest the desktop cursor. TV detection is a
name-based heuristic; displays identified as TVs do not advertise brightness or
volume controls. Hardware and driver support can still make brightness or
volume unavailable.

## Architecture

This repository is an npm workspace with three runtime layers:

```text
mobile (Expo / React Native)
  └─ QR pairing, saved devices, controls, settings, local persistence
       │
       │ WebSocket handshake + encrypted application messages
       ▼
desktop (Electron / Node.js)
  ├─ WebSocket server and pairing trust store
  ├─ renderer connected through a preload IPC bridge
  └─ macOS and Windows host adapters
       │
       ▼
mouse, keyboard, display, audio, application, and power APIs

packages/protocol
  └─ shared message types, validation, versions, and secure transport
```

Important source areas:

- `mobile/App.tsx` and `mobile/navigation/`: mobile application and navigation
- `mobile/features/`: pairing, trackpad, keyboard, shortcuts, settings, and
  remote-control behavior
- `mobile/websocket/`: connection lifecycle and command sending
- `desktop/electron/`: Electron main process, renderer, preload bridge, and UI
- `desktop/websocket/`: authenticated WebSocket server
- `desktop/auth/`: pairing tokens, trusted-device persistence, and token proofs
- `desktop/host/`: macOS and Windows implementations
- `desktop/mouse-control/`: pointer and keyboard execution
- `packages/protocol/`: protocol shared by desktop and mobile

The mobile app connects directly to the desktop. There is no relay, hosted API,
database, analytics service, or account server.

## Pairing and security

Mac Remote uses `ws://` on the LAN for reachability, but application traffic is
encrypted after authentication.

Pairing works as follows:

1. The desktop creates a random pairing token and embeds it with its LAN
   WebSocket URL in the displayed QR code.
2. Pairing tokens expire after 10 minutes and are single-use. The QR rotates
   shortly before expiry while a small number of still-valid previous tokens
   remain accepted to avoid scan/refresh races.
3. The desktop sends a random authentication challenge and server nonce.
4. The phone proves possession of the pairing token with HMAC-SHA-256 instead
   of sending the token in the authentication request.
5. Both peers deterministically derive a device token. The desktop persists
   only its SHA-256 hash; the phone saves the token with the desktop record.
6. Later connections use a challenge-response proof of the saved device token.
   A phone can be revoked from the desktop UI.

After authentication:

- HKDF-SHA-256 derives separate client-to-server and server-to-client keys from
  the trusted secret hash, fresh client and server nonces, client ID, protocol
  version, and encryption version.
- XChaCha20-Poly1305 encrypts and authenticates each application message.
- Envelope metadata is authenticated as additional data.
- Strict sequence numbers reject replayed, stale, and out-of-order ciphertext.
- Plaintext application messages are rejected after secure mode starts.
- Protocol validators constrain message shapes, command values, text sizes,
  URLs, and numeric ranges before host actions run.

The authentication challenge, authentication request, acceptance, and rejection
messages remain plaintext. Their proofs do not expose the pairing or device
token, but LAN observers can see connection metadata such as client IDs,
versions, and timing.

Packaged desktop builds disable legacy raw-token authentication by default.
Development builds allow it for migration compatibility. Override this only
when testing:

```bash
REMOTE_LEGACY_RAW_TOKEN_AUTH=0 npm run desktop:dev
```

Security boundaries and limitations:

- This is a LAN application, not an Internet-facing remote-access service.
- The server binds to `0.0.0.0`; the application does not configure the host
  firewall or restrict source subnets.
- The transport does not use TLS certificates. The authenticated application
  layer protects commands after pairing, while handshake metadata remains
  visible.
- Saved desktop credentials and settings are stored by the mobile app through
  AsyncStorage, not a hardware-backed credential vault.
- Anyone who can scan an unused desktop QR code before it expires can pair a
  phone. Keep the QR visible only in a trusted environment and revoke unknown
  devices from the desktop.

## Prerequisites

- Node.js `20.19.4` or newer; Node.js 22 LTS is recommended.
- npm with workspace support.
- A macOS or Windows computer and an iOS or Android phone on the same LAN.
- macOS Accessibility permission for the Electron application used to run the
  host.
- Xcode Command Line Tools on macOS to compile the optional native display
  brightness helper. A failed helper build is non-fatal, but can reduce
  brightness support.
- Expo tooling or EAS credentials when building the mobile app.

The repository uses the public `@nut-tree-fork/nut-js` package. It does not
require the private nut.js registry.

## Development setup

Install all workspaces from the repository root:

```bash
npm install
```

The simplest development startup is:

```bash
npm run desktop:dev
```

The desktop command builds the shared protocol and desktop code, launches
Electron, starts the Expo server in development mode, and shows both pairing and
Expo QR codes.

To run both workspace commands explicitly while preventing the desktop process
from starting a second Expo server:

```bash
REMOTE_MOBILE_SERVER=0 npm run dev
```

Individual commands are also available:

```bash
npm run mobile:start
npm run desktop:dev
```

For native mobile development, use an Expo development build appropriate for
the target platform. The secure transport requires a native-backed
`crypto.getRandomValues`, installed at mobile startup by
`react-native-get-random-values`.

### macOS Accessibility

In **System Settings > Privacy & Security > Accessibility**, enable the actual
application running the desktop host. During development this is normally:

```text
node_modules/electron/dist/Electron.app
```

If Terminal is already enabled but input control still fails, add Electron.app
as well. Fully quit and restart the desktop app after changing permissions.

For workspace switching, also verify:

**System Settings > Keyboard > Keyboard Shortcuts > Mission Control > Move left
a space / Move right a space**

### Development configuration

Supported desktop environment variables include:

- `REMOTE_CONTROL_PORT`: WebSocket port; defaults to `8787`
- `REMOTE_DEVICE_NAME`: override the displayed host name
- `REMOTE_MOBILE_SERVER=0|1`: disable or force automatic Expo startup
- `REMOTE_MOBILE_DIR`: mobile workspace used by desktop Expo startup
- `REMOTE_MOBILE_COMMAND`: command used to start the mobile server
- `REMOTE_EXPO_URL`: show a specific already-running Expo URL
- `REACT_NATIVE_PACKAGER_HOSTNAME`: host used when constructing the Expo URL
- `REMOTE_DEVTOOLS=1`: open Electron developer tools
- `REMOTE_LEGACY_RAW_TOKEN_AUTH=0|1`: control migration-only raw-token auth

Example:

```bash
REMOTE_CONTROL_PORT=9000 REMOTE_DEVICE_NAME="Living Room Mac" npm run desktop:dev
```

## Verification

Run all protocol, mobile, and desktop tests followed by all TypeScript checks:

```bash
npm run verify
```

Or run type checks alone:

```bash
npm run typecheck
```

The test suites cover protocol validation and encryption, pairing-token and
device-token behavior, secure server behavior, and selected mobile navigation
and remote-control logic. They do not replace manual permission, native input,
multi-display, or device-to-device testing.

## Desktop releases

Desktop packaging is handled by electron-builder. The current desktop version
and product metadata are in `desktop/package.json`. The packaged product name is
**Remote Control**, while this repository and document refer to the product as
Mac Remote.

### macOS

Run macOS builds on macOS:

```bash
npm install
npm run desktop:pack:mac
```

This creates an unpacked **Remote Control.app** under `desktop/release/`
(normally `desktop/release/mac/Remote Control.app`; electron-builder may add an
architecture suffix to the containing directory).

Create DMG and ZIP artifacts with:

```bash
npm run desktop:dist:mac
```

The current configuration sets `identity: null`; generated macOS artifacts are
not code-signed or notarized. Gatekeeper can warn or block them. A distributable
release requires an owned application identifier, Developer ID signing,
notarization, and a manual smoke test of Accessibility-controlled actions.

### Windows

Run Windows builds on Windows:

```bash
npm install
npm run desktop:pack:win
```

This creates an unpacked Windows application under `desktop/release/`.

Create an NSIS installer and ZIP with:

```bash
npm run desktop:dist:win
```

No Windows signing certificate is configured. SmartScreen can warn about the
generated installer until it is signed by a trusted certificate.

Packaged desktop apps do not start Expo or show an Expo QR by default. They show
only the Mac Remote pairing QR.

## Mobile releases

Mobile metadata is defined in `mobile/app.json`; EAS profiles are defined in
`eas.json`.

Current identifiers:

- iOS bundle identifier: `local.remote-control.mobile`
- Android package: `local.remotecontrol.mobile`

Development and internal builds:

```bash
npx eas build --platform ios --profile development
npx eas build --platform android --profile development
npx eas build --platform android --profile preview
```

The Android `preview` profile produces an internal APK. Production builds use:

```bash
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

The production profile auto-increments build versions. The submit profile is
otherwise empty, so store credentials, listing metadata, review compliance, and
submission remain external release tasks.

The `local.*` identifiers are development placeholders. Replace them with
identifiers owned by the publisher before App Store or Play Store distribution.
Apple distribution also requires an Apple Developer account.

There is no release CI workflow in this repository. Releases are local,
platform-specific operations and should be preceded by `npm run verify` plus
manual macOS, Windows, iOS, and Android smoke tests for the platforms being
shipped.

## Operational limitations

- Phone and desktop must be able to reach each other directly on the same
  network. Guest Wi-Fi client isolation, VPN routing, firewalls, or changed DHCP
  addresses can prevent connection or invalidate a saved host address.
- The desktop application must remain running for remote control to work.
- There is no cloud relay, NAT traversal, Internet remote access, or automatic
  service discovery beyond the LAN address embedded in the QR code.
- macOS input control depends on Accessibility permission; Windows input can be
  constrained by privilege boundaries and system policy.
- Brightness support is hardware-specific. Windows uses WMI-supported internal
  displays; macOS uses Apple display interfaces and bundled brightness helpers.
- TV classification is inferred from the display name and can be wrong.
- Preset application behavior differs by host platform and can depend on
  Chrome, Spotify, or Prime Video being installed.
- The mobile UI is phone- and portrait-oriented; iPad and browser releases are
  not supported.
- Desktop and mobile releases are currently versioned `0.1.0` and use
  development application identifiers.

## Commercial and account model

The implemented product has no commercial layer:

- no subscription, purchase, trial, entitlement, advertisement, or paywall code
- no billing SDK or store receipt validation
- no hosted account, synchronization, telemetry, or licensing backend
- no feature tiers; all implemented controls are local and available after
  pairing

Account and sign-in screens exist in the source tree, but the
`accountAuthentication` feature flag is disabled. They create only a local
placeholder session and do not authenticate against a service. They are not
part of the active product flow.

The npm workspaces are marked `private`, and this repository contains no license
file. That does not establish a free, open-source, or paid distribution model.
Pricing, customer licensing, support, code-signing identities, store ownership,
and sales infrastructure are outside the implemented system.

## macOS development autostart

For a source checkout used as a development host, install a per-user LaunchAgent
that runs `npm run dev` at login:

```bash
npm run autostart:install
```

Remove it with:

```bash
npm run autostart:uninstall
```

Logs are written to:

```text
~/Library/Logs/local.remote-control.dev.out.log
~/Library/Logs/local.remote-control.dev.err.log
```

The desktop UI controls the same kind of LaunchAgent: it writes a plist that
runs `npm run dev` from a resolved working directory. It does not register the
packaged application executable. This feature therefore requires a usable
source checkout, Node.js, and npm, and should be treated as development
autostart rather than packaged-app autostart.
