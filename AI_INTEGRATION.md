# AI Parser Integration Guide

This document explains how to integrate the AI parser into your existing QuickAdd extension.

## Overview

The AI parser (`src/shared/ai-parser.ts`) enhances the existing chrono-based parser by:
- Using LLMs to better understand context and intent
- Extracting attendees, locations, and priorities more accurately
- Handling ambiguous or complex text better

## Integration Steps

### 1. Update the Parser Logic

You need to modify `src/shared/parser.ts` to call the AI parser when enabled.

**Add these imports at the top:**

```typescript
import { enhanceWithAI } from './ai-parser';
import type { AIParserConfig } from './types';
```

**Update the `parseCapture` function signature to accept AI config:**

```typescript
export function parseCapture(
  payload: ParsePayload, 
  defaults: QuickAddDefaults,
  aiConfig?: AIParserConfig  // Add this parameter
): ParseResponse {
  // ... existing code
}
```

**Add AI enhancement before returning the result:**

```typescript
export async function parseCapture(
  payload: ParsePayload, 
  defaults: QuickAddDefaults,
  aiConfig?: AIParserConfig
): Promise<ParseResponse> {  // Make it async!
  
  // ... your existing chrono-based parsing logic ...
  
  // At the end, before returning, add this:
  let finalCapture = capture;  // Your existing parsed capture
  
  // Try AI enhancement if enabled
  if (aiConfig?.enabled) {
    try {
      const aiEnhancement = await enhanceWithAI(payload, aiConfig);
      if (aiEnhancement) {
        // Merge AI results with chrono results
        // AI results override chrono where they exist
        finalCapture = {
          ...finalCapture,
          ...aiEnhancement,
          // Keep some fields from original if AI didn't provide them
          id: finalCapture.id,
          source: finalCapture.source,
          tz: finalCapture.tz,
          // Use AI confidence if higher
          confidence: Math.max(finalCapture.confidence, aiEnhancement.confidence || 0)
        };
      }
    } catch (error) {
      console.warn('AI enhancement failed, using local parser result:', error);
      // Continue with original parse result
    }
  }
  
  return {
    capture: finalCapture,
    alternatives,
    warnings,
    diagnostics
  };
}
```

### 2. Update Background Script to Pass AI Config

Modify `src/background/index.ts` in the `handleParse` function:

**Find this function:**

```typescript
async function handleParse(payload: ParsePayload): Promise<BackgroundResponse> {
  const settings = await getSettings(payload.tz);
  const response = parseCapture(payload, { ...settings.defaults, tz: payload.tz });
  return { type: 'quickadd:parse:result', payload: response };
}
```

**Update it to:**

```typescript
async function handleParse(payload: ParsePayload): Promise<BackgroundResponse> {
  const settings = await getSettings(payload.tz);
  const response = await parseCapture(
    payload, 
    { ...settings.defaults, tz: payload.tz },
    settings.aiParser  // Pass AI config
  );
  return { type: 'quickadd:parse:result', payload: response };
}
```

### 3. Create Settings UI for AI Configuration

Since we had encoding issues with the options page, here's what needs to be added:

**In `src/options/main.tsx`, add these UI elements:**

```typescript
// Add to your settings form:

<section style={{ marginBottom: '2rem', borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
  <h2>🤖 AI Enhancement (Optional)</h2>
  <p>Use AI to better understand complex events and extract more details.</p>
  
  <div style={{ marginBottom: '1rem' }}>
    <label>
      <input 
        type="checkbox" 
        checked={settings.aiParser.enabled}
        onChange={(e) => {
          const newSettings = {
            ...settings,
            aiParser: { ...settings.aiParser, enabled: e.target.checked }
          };
          handleSave(newSettings);
        }}
      />
      Enable AI Enhancement
    </label>
  </div>

  {settings.aiParser.enabled && (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="ai-provider" style={{ display: 'block', marginBottom: '0.5rem' }}>
          AI Provider
        </label>
        <select 
          id="ai-provider"
          value={settings.aiParser.provider}
          onChange={(e) => {
            const newSettings = {
              ...settings,
              aiParser: { ...settings.aiParser, provider: e.target.value as any }
            };
            handleSave(newSettings);
          }}
        >
          <option value="gemini">Google Gemini (Free - 15 req/min)</option>
          <option value="huggingface">Hugging Face (Free)</option>
          <option value="local">Local Only (No AI)</option>
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="ai-key" style={{ display: 'block', marginBottom: '0.5rem' }}>
          API Key
          <a 
            href={settings.aiParser.provider === 'gemini' 
              ? 'https://makersuite.google.com/app/apikey' 
              : 'https://huggingface.co/settings/tokens'}
            target="_blank"
            style={{ marginLeft: '0.5rem', fontSize: '0.9em' }}
          >
            (Get Key)
          </a>
        </label>
        <input 
          id="ai-key"
          type="password"
          value={settings.aiParser.apiKey || ''}
          onChange={(e) => {
            const newSettings = {
              ...settings,
              aiParser: { ...settings.aiParser, apiKey: e.target.value }
            };
            handleSave(newSettings);
          }}
          placeholder="Paste your API key here"
          style={{ width: '100%', padding: '0.5rem' }}
        />
      </div>

      <div style={{ padding: '1rem', backgroundColor: '#f0f8ff', borderRadius: '4px' }}>
        <strong>Privacy Note:</strong> When AI is enabled, selected text is sent to {settings.aiParser.provider === 'gemini' ? 'Google Gemini' : 'Hugging Face'} for processing. 
        The API key is stored locally in your browser.
      </div>
    </>
  )}
</section>
```

## Testing the Integration

### Test 1: Without AI (Baseline)

1. Disable AI in settings
2. Highlight: `Meeting tomorrow at 2pm`
3. Should create event using chrono parser

### Test 2: With AI (Enhanced)

1. Enable AI in settings
2. Add your Gemini API key
3. Highlight: `Flight to NYC on Dec 15 at 6:30 AM from SFO, arriving JFK at 3 PM. Confirmation: ABC123`
4. AI should extract:
   - Title: "Flight to NYC"
   - Start: Dec 15, 6:30 AM
   - End: Dec 15, 3:00 PM
   - Location: "SFO → JFK"
   - Notes: Including confirmation number

### Test 3: Complex Task

1. Highlight: `URGENT: Review and approve budget proposal by end of week`
2. AI should extract:
   - Type: Task
   - Priority: High (from "URGENT")
   - Title: "Review and approve budget proposal"
   - Due: End of this week

## How It Works

```
User highlights text
       ↓
Content script captures text + page context
       ↓
Background script receives parse request
       ↓
1. Chrono parser runs (fast, local, always works)
       ↓
2. If AI enabled → AI parser runs (slower, but smarter)
       ↓
3. AI results merged with chrono results
   (AI overrides chrono where confident)
       ↓
User sees confirmation card with best results
       ↓
User clicks "Yes"
       ↓
Event/Task created in Google Calendar/Tasks
```

## Fallback Strategy

The integration is designed to gracefully degrade:

1. **AI fails?** → Use chrono results
2. **No API key?** → Use chrono results
3. **Rate limit exceeded?** → Use chrono results
4. **Network error?** → Use chrono results

The extension will always work, even if AI is misconfigured.

## Performance Considerations

- **Chrono parser**: ~10-50ms (local)
- **AI parser (Gemini)**: ~500-2000ms (API call)
- **Total**: ~2s worst case (still under the 4s budget)

To optimize:
- Cache common patterns locally
- Show chrono results immediately, update if AI finds better
- Add timeout (e.g., 3s max for AI)

## API Costs (All FREE!)

- **Google Gemini**: 15 requests/min, 1500/day - FREE
- **Hugging Face**: ~1000 requests/day - FREE
- **Google Calendar API**: 1M requests/day - FREE
- **Google Tasks API**: 1M requests/day - FREE

Users can create hundreds of events per day without paying anything!

## Privacy

When AI is disabled:
- All parsing happens locally (chrono-node)
- Nothing sent to external services except Google Calendar/Tasks APIs

When AI is enabled:
- Selected text + page title sent to AI provider
- No page content, no browsing history
- User must explicitly enable and provide API key
- Clear disclosure in settings UI

## Next Steps

1. Apply the code changes above to:
   - `src/shared/parser.ts`
   - `src/background/index.ts`
   - `src/options/main.tsx`

2. Rebuild the extension:
   ```bash
   npm run build
   ```

3. Reload in Chrome and test!

4. Follow the `SETUP_GUIDE.md` to get your API keys

## Troubleshooting

**"AI parsing takes too long"**
- Add a timeout wrapper around `enhanceWithAI()` call
- Fall back to chrono results after 3 seconds

**"Getting 429 errors (rate limit)"**
- Gemini free tier: 15 requests/minute
- Add local caching for repeated text
- Show warning in settings if limit exceeded

**"AI results are worse than chrono"**
- Compare confidence scores
- Only use AI result if `confidence > 0.7`
- Allow user to disable AI per-result

**"Want to use a different AI provider"**
- Add to the `AIParserConfig` type
- Implement in `ai-parser.ts` following the existing pattern
- Add UI option in settings

---

That's it! Your extension now has AI superpowers while maintaining a solid fallback to local parsing. 🚀
