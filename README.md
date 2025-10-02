# QuickAdd Browser Extension

QuickAdd brings the "highlight ? action" workflow to modern browsers. Select text on any page, review a compact confirmation card, and create calendar events or tasks across Google, Microsoft, Todoist, or download an ICS fallback in under a few seconds.

## Key Features

- Floating chip and keyboard shortcuts (`Alt+Shift+Q`, `Alt+Shift+C`, `Alt+Shift+T`) to capture selection context instantly.
- Local-first natural language parsing via `chrono-node` with custom heuristics (event/task detection, duration, reminders, attendees, locations).
- Confirmation card with quick edits, ambiguity suggestions, de-duplication prompts, and optional voice confirmation (Web Speech API).
- Background service worker handles provider routing, ICS fallback downloads, and cached dedupe checks.
- Options page for configuring defaults (provider, duration, reminders, due time, voice, telemetry) and clearing local caches.
- Popup helper summarising active defaults and linking to settings.

## Project Structure

```
src/
  background/        # MV3 service worker logic
  content/           # Selection detection, chip + confirmation UI
  options/           # Settings/options page
  popup/             # Toolbar popup UI
  shared/            # Types, parser, time helpers, ICS generator, messaging contracts
public/icons/        # Generated extension icons
manifest.config.ts   # MV3 manifest (consumed by @crxjs/vite-plugin)
```

## Getting Started

```bash
npm install
npm run dev    # launches Vite in extension development mode
```

`npm run dev` starts a watched build. Load the generated `dist` directory as an unpacked extension in Chromium-based browsers. During development, the CRX plugin keeps assets rebuilt on save.

## Building & Checking

```bash
npm run typecheck   # TypeScript without emit
npm run build       # Production bundle into ./dist
```

The build command produces a MV3-ready bundle with background/service worker, content script, popup, options page, and assets.

## Loading the Extension

1. Run `npm run build`.
2. Open `chrome://extensions` (or the equivalent).
3. Enable *Developer mode*.
4. Choose *Load unpacked* and select the generated `dist/` directory.

## Testing Voice Confirmation

Voice confirmation relies on the Web Speech API. Enable the toggle in *Settings ? Controls* and ensure your browser supports the API (Chromium-based browsers do).

## Privacy & Data

- Parsing runs locally; external API calls are stubbed aside from provider placeholders and the optional ICS download.
- Recent captures are cached in `chrome.storage.local` for lightweight de-duplication. Use the *Erase cached capture history* button in settings to clear this cache.

## Next Steps

- Plug in OAuth/provider integrations for Google, Microsoft, and Todoist.
- Expand parsing coverage (recurrence rules, locale variations) and add automated test suites.
- Implement telemetry/analytics gated by the opt-in toggle.

---

Happy capturing!
