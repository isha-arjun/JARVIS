# JARVIS — Personal Intelligence

A web command center and early desktop companion for voice-led reasoning and simulation.

## Current prototype
- Natural-language command entry and browser speech input.
- British English speech output using available system voices.
- Eight first-pass simulation templates: advertising, business, growth, pricing, project delivery, conversion funnels, risk, and abstract population dynamics.
- Results include assumptions, illustrative metrics, and limitations.
- Electron desktop shell with a global show/hide shortcut.

## Important boundaries
The current build uses deterministic simulation templates and local browser calculations. It is **not yet a general-purpose AI reasoning agent**: it does not call an LLM, dynamically write new models, connect external accounts, or execute actions in other apps. Some simulation assumptions are deliberately generic and should be replaced with real data. No ad campaigns are launched and no money is spent.

The website cannot listen for a wake word globally or while closed. The desktop shell currently supports a global keyboard shortcut; local wake-word detection, robust speech-to-text, and a secure tool/action layer are planned follow-on components.

## Start
```bash
npm install
npm run dev
```

## Desktop
See [desktop/README.md](desktop/README.md).\n## Optional AI reasoning\nThe desktop companion includes an optional local Ollama bridge for a no-API-key reasoning model. Current Ollama macOS releases require macOS 14 or newer; older Monterey Macs cannot use the current app. The connector is therefore an optional integration point, not a ready-to-use brain on every Mac. If no compatible local model is available, the app falls back to its built-in simulation templates. The model bridge only calls the local loopback service and does not execute external actions.\n