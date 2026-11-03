# JARVIS desktop companion

This is the first desktop shell for the JARVIS web command center.

## Run on macOS
1. Install Node.js 20 or newer.
2. In the project folder, run `npm install`.
3. Run `npm run desktop:dev`.
4. Use **Control + Shift + Space** (or **Command + Shift + Space** on macOS) to show/hide the assistant.

For an Intel Mac installer, run `npm run dist:mac`. The unsigned DMG is written to `release/`. This command requires Node.js and the project dependencies on a Mac. The packaging target is x64 and the Electron runtime is configured for macOS 10.15 or newer.

## Current capability boundary
The desktop shell provides a global keyboard shortcut and a desktop window. It does **not yet** implement an always-on local “JARVIS” wake-word detector, background microphone capture, or an offline speech model. The website's microphone button uses browser speech recognition where supported. The wake-word engine is a separate next phase and must have a clear listening indicator and a mute control.

## Optional local reasoning brain (no API key)
The local model connector targets Ollama at `127.0.0.1:11434` and does not require a cloud API key. Important: current Ollama macOS releases require macOS 14 or newer. On macOS 12 Monterey, this connector cannot be used with the current Ollama app. Do not install an unsupported legacy build just to enable it. The connector remains optional and can be enabled later if the operating system or a supported local inference runtime changes.
