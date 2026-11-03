# JARVIS desktop companion

This is the first desktop shell for the JARVIS web command center.

## Run on macOS
1. Install Node.js 20 or newer.
2. In the project folder, run `npm install`.
3. Run `npm run desktop:dev`.
4. Use **Control + Shift + Space** (or **Command + Shift + Space** on macOS) to show/hide the assistant.

For a packaged build, run `npm run build` and then package Electron with an Electron packaging tool.

## Current capability boundary
The desktop shell provides a global keyboard shortcut and a desktop window. It does **not yet** implement an always-on local “JARVIS” wake-word detector, background microphone capture, or an offline speech model. The website's microphone button uses browser speech recognition where supported. The wake-word engine is a separate next phase and must have a clear listening indicator and a mute control.
