# Windows build guide

The Node Runner desktop edition is a small Electron wrapper around the existing shared game at:

```text
https://node-runner-xayv.onrender.com
```

It does not bundle or start Express, Socket.IO, rooms, bots, or the authoritative match simulation. All desktop and browser players connect to the same Render service, so room codes continue to work across both versions.

## Requirements

- Windows 10 or Windows 11, x64
- Node.js 24 LTS
- npm
- Internet access for dependency installation, the build, and gameplay

No `.env` file is needed for a production build.

## Build commands

Open PowerShell in the repository root and run these commands in order:

```powershell
npm ci
npm run release:check
npm run desktop:dev
npm run build:win
```

`npm run desktop:dev` opens the Electron application against the production Render service. Close the desktop window after the manual check, then run the build command.

If a managed npm policy explicitly withholds Electron's install script and the first desktop launch only reports that it is downloading the Electron binary, run the package's official installer once and retry:

```powershell
node node_modules\electron\install.js
npm run desktop:dev
```

This troubleshooting step is not normally required.

`npm run build:win` runs all release checks again and produces both Windows x64 targets:

```text
dist/Node-Runner-1.0.0-Windows-x64.exe
dist/Node-Runner-1.0.0-Windows-x64.zip
```

The `.exe` is the portable, no-install build. The `.zip` contains the directly runnable Windows application and is the intended itch.io upload.

To build only one target:

```powershell
npm run build:win:portable
npm run build:win:zip
```

## Local desktop development

To point Electron at a locally running Node Runner server, start the server in one PowerShell window:

```powershell
npm start
```

Then use a second PowerShell window:

```powershell
$env:NODE_RUNNER_GAME_URL = "http://localhost:3000"
npm run desktop:dev
Remove-Item Env:NODE_RUNNER_GAME_URL
```

Only `http://localhost`, `http://127.0.0.1`, or `http://[::1]` overrides are accepted. Packaged production builds fall back safely to the verified HTTPS Render origin.

## Desktop behaviour and security

- The website runs with Node integration disabled, context isolation enabled, Chromium sandboxing enabled, and web security enabled.
- No preload script or Node API bridge is exposed to the game.
- Navigation is restricted to the configured game origin and the local offline screen.
- Ordinary external HTTPS links open in the default browser. Unsafe and unknown protocols are rejected.
- F11 or Alt+Enter toggles fullscreen. Escape leaves fullscreen. Ctrl+R reloads or retries the game.
- Saved settings, high scores, and achievements use the Electron browser profile and persist between desktop launches. They are separate from another browser's storage.
- The offline screen does not run a local game. It provides Retry and Open in browser actions because multiplayer requires the shared server.

## Online-only requirement

The Windows edition intentionally requires an internet connection. Render may take time to start after inactivity; use Retry on the local connection screen after waiting briefly.

## Windows signing

The jam build does not require signing credentials and electron-builder is not configured to publish automatically. The generated executable is unsigned, so Windows SmartScreen may display a warning on another computer. Test this behaviour before submission and never tell players that an unsigned file is signed.

## Application icon

No legitimate repository-owned square game logo or `.ico` file was found, so the release uses Electron's default icon. This does not block the build.

For a later custom icon, create `build/icon.ico` only from artwork the team owns or is licensed to use. It should be a square Windows ICO containing at least a 256x256 image and preferably the common 16, 24, 32, 48, 64, 128, and 256 pixel sizes. Then add this property under `build.win` in `package.json`:

```json
"icon": "build/icon.ico"
```

Do not substitute an unverified internet image or a character sprite without reviewing its licence.
