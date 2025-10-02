# QuickAdd - Quick Start Guide

Get your QuickAdd extension up and running in 15 minutes! 🚀

## What You Have Now

✅ **Core Extension Built** - Successfully compiled  
✅ **Google Calendar Integration** - Code ready (`src/background/google.ts`)  
✅ **Google Tasks Integration** - Code ready  
✅ **AI Parser Module** - Created (`src/shared/ai-parser.ts`)  
✅ **Type Definitions** - Updated with AI config  

## What You Need to Do

### Option A: Quick Test (No Google/AI) - 2 minutes

Test the extension immediately without any setup:

1. **Load the extension:**
   ```bash
   # Already built! Just load it:
   # Open Chrome → chrome://extensions/
   # Enable "Developer mode"
   # Click "Load unpacked" → Select the "dist" folder
   ```

2. **Test it:**
   - Go to any webpage
   - Highlight: `Meeting tomorrow at 2pm`
   - Press `Alt+Shift+Q`
   - Click "Yes" on the confirmation
   - A `.ics` file will download ✓

### Option B: Full Setup (Google + AI) - 15 minutes

Follow these guides in order:

1. **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Get Google Calendar & AI working
   - Section 1: Google Cloud Console (10 min)
   - Section 2: Get Gemini API Key (2 min)
   - Section 3: Configure extension (3 min)

2. **[AI_INTEGRATION.md](./AI_INTEGRATION.md)** - Connect AI to parser
   - Code changes needed in 3 files
   - Copy-paste ready snippets provided

## Current Status Summary

### ✅ What's Working

- Extension builds and loads in Chrome
- Text selection detection
- Keyboard shortcuts (`Alt+Shift+Q`, `Alt+Shift+C`, `Alt+Shift+T`)
- Context menu items
- Local date/time parsing (chrono-node)
- `.ics` file download fallback
- Settings storage
- History tracking

### ⚠️ What Needs Configuration

These features are **coded but not configured**:

1. **Google Calendar** - Needs OAuth Client ID in `manifest.config.ts`
2. **Google Tasks** - Needs OAuth Client ID in `manifest.config.ts`
3. **AI Enhancement** - Needs API key in extension settings

### 🔧 What Needs Integration

The AI parser is created but needs to be connected:

1. Update `src/shared/parser.ts` - Make it call AI parser
2. Update `src/background/index.ts` - Pass AI config to parser
3. Update `src/options/main.tsx` - Add AI settings UI

See [AI_INTEGRATION.md](./AI_INTEGRATION.md) for exact code to add.

## Test Scenarios

### Scenario 1: Simple Event

```
Text: "Team standup tomorrow at 10am for 30 minutes"
Expected: Event on [tomorrow], 10:00 AM - 10:30 AM
Provider: Google Calendar (if configured) or .ics
```

### Scenario 2: Task with Deadline

```
Text: "Submit quarterly report by Friday 5pm"
Expected: Task due [this Friday] at 5:00 PM
Provider: Google Tasks (if configured) or .ics
```

### Scenario 3: Complex Event (AI Enhanced)

```
Text: "Flight to London on March 15 departing LAX at 7:30 PM, 
       arriving Heathrow at 1:45 PM next day. Confirmation: BA123"
Expected:
  - Title: "Flight to London"
  - Start: March 15, 7:30 PM
  - End: March 16, 1:45 PM
  - Location: "LAX → Heathrow"
  - Notes: "Confirmation: BA123"
Requires: AI enabled with Gemini API key
```

### Scenario 4: Priority Task (AI Enhanced)

```
Text: "URGENT: Review security patch before deployment"
Expected:
  - Type: Task
  - Title: "Review security patch before deployment"
  - Priority: High (from "URGENT")
Requires: AI enabled
```

## File Structure Overview

```
QuickAdd/
├── src/
│   ├── background/
│   │   ├── index.ts          ✅ Main background script
│   │   └── google.ts         ✅ NEW - Google API integration
│   ├── content/
│   │   └── index.tsx         ✅ Content script (selection detection)
│   ├── options/
│   │   └── main.tsx          ⚠️  Settings UI (needs AI section)
│   ├── popup/
│   │   └── main.tsx          ✅ Extension popup
│   └── shared/
│       ├── types.ts          ✅ UPDATED - Added AI types
│       ├── parser.ts         ⚠️  Parser (needs AI integration)
│       ├── ai-parser.ts      ✅ NEW - AI enhancement module
│       ├── settings.ts       ✅ UPDATED - AI defaults
│       ├── ics.ts            ✅ ICS file generation
│       └── messages.ts       ✅ Message passing types
├── manifest.config.ts        ⚠️  Needs Client ID
├── SETUP_GUIDE.md           📖 Complete setup instructions
├── AI_INTEGRATION.md        📖 How to connect AI parser
└── QUICK_START.md           📖 This file
```

Legend:
- ✅ = Ready to use
- ⚠️ = Needs configuration or code update
- 📖 = Documentation

## Next Steps (Choose Your Path)

### Path 1: Just Test Locally (5 min)

1. Extension is already built
2. Load it in Chrome
3. Test with `.ics` downloads
4. No external setup needed

**Good for:** Quick testing, demo, understanding how it works

### Path 2: Add Google Integration (15 min)

1. Follow `SETUP_GUIDE.md` sections 1-3
2. Get OAuth Client ID
3. Update `manifest.config.ts`
4. Rebuild and test

**Good for:** Real calendar/task integration, daily use

### Path 3: Full Setup with AI (20 min)

1. Do Path 2 first
2. Get Gemini API key (free)
3. Follow `AI_INTEGRATION.md`
4. Add AI settings UI
5. Test complex scenarios

**Good for:** Best experience, production-ready, app store submission

## Troubleshooting

### Build Errors

```bash
# If you see TypeScript errors:
npm run typecheck

# If build fails:
rm -rf node_modules dist
npm install
npm run build
```

### Extension Won't Load

- Check `chrome://extensions/` for error messages
- Make sure you're loading the `dist` folder (not `src`)
- Try removing and re-adding the extension

### "Could not load manifest" Error

- Make sure you ran `npm run build` first
- Check that `dist/manifest.json` exists
- Verify `manifest.config.ts` has valid syntax

### Features Not Working

| Issue | Solution |
|-------|----------|
| Can't create Google Calendar events | Add OAuth Client ID to `manifest.config.ts` |
| AI not enhancing | Add API key in settings + integrate parser |
| No confirmation card appears | Check browser console for errors |
| Keyboard shortcuts don't work | Check `chrome://extensions/shortcuts` |

## API Keys Checklist

Before you can use these features, you need:

- [ ] **Google OAuth Client ID** - For Calendar/Tasks integration
  - Get from: Google Cloud Console
  - Add to: `manifest.config.ts` line 24

- [ ] **Gemini API Key** (optional) - For AI enhancement
  - Get from: https://makersuite.google.com/app/apikey
  - Add to: Extension settings page
  - Free tier: 15 requests/min

## Free Tier Limits

All services have generous free tiers:

| Service | Free Tier | Good For |
|---------|-----------|----------|
| Google Calendar API | 1M requests/day | ~10,000 events/day |
| Google Tasks API | 1M requests/day | ~10,000 tasks/day |
| Gemini API | 15 req/min, 1500/day | ~750 AI parses/day |
| Hugging Face API | ~1000 req/day | ~500 AI parses/day |

**You won't hit these limits** in normal daily use!

## Success Criteria

You'll know everything is working when:

1. ✅ Extension loads without errors
2. ✅ Highlighting text shows confirmation card
3. ✅ Clicking "Yes" creates event/task
4. ✅ Item appears in Google Calendar/Tasks
5. ✅ AI enhances complex text (if configured)

## Getting Help

If you're stuck:

1. Check the browser console (`F12` → Console)
2. Review the error message carefully
3. Check that all API keys are correct
4. Try disabling AI to isolate the issue
5. Review the relevant guide:
   - Google setup: `SETUP_GUIDE.md`
   - AI integration: `AI_INTEGRATION.md`
   - PRD reference: `README.md` (your original PRD)

## What's Next?

After you get it working:

1. **Customize settings:**
   - Default event duration
   - Default reminder time
   - Preferred timezone

2. **Test edge cases:**
   - Recurring events
   - All-day events
   - Multiple time zones
   - Complex attendee lists

3. **Prepare for store:**
   - Add privacy policy
   - Create promotional images
   - Write store description
   - Test in different browsers

4. **Add more providers:**
   - Microsoft Calendar/To Do
   - Todoist
   - Notion

---

## Quick Command Reference

```bash
# Build extension
npm run build

# Type check (without building)
npm run typecheck

# Development mode (auto-rebuild)
npm run dev

# Clean and rebuild
rm -rf dist && npm run build
```

## Keyboard Shortcuts

- `Alt+Shift+Q` - Smart Add (auto-detect)
- `Alt+Shift+C` - Force Calendar Event
- `Alt+Shift+T` - Force Task

Right-click selected text:
- "Add to Calendar (QuickAdd)"
- "Add to Tasks (QuickAdd)"

---

**Ready to start?** Pick a path above and dive in! 🚀

The extension is **already functional** with local parsing. Google and AI features just make it even better!
