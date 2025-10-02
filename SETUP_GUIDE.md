# QuickAdd Extension - Complete Setup Guide

This guide will walk you through setting up Google Calendar, Google Tasks, and AI enhancement features.

## Table of Contents
1. [Google Cloud Console Setup](#google-cloud-console-setup)
2. [Get Free AI API Key (Google Gemini)](#get-free-ai-api-key)
3. [Configure Your Extension](#configure-your-extension)
4. [Testing the Extension](#testing-the-extension)

---

## 1. Google Cloud Console Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** at the top → **"New Project"**
3. Name it **"QuickAdd Extension"**
4. Click **"Create"**

### Step 2: Enable Required APIs

1. In your new project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Calendar API"** and click **"Enable"**
3. Search for **"Google Tasks API"** and click **"Enable"**

### Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (for personal use) → Click **"Create"**
3. Fill in the required fields:
   - **App name**: QuickAdd
   - **User support email**: Your email
   - **Developer contact**: Your email
4. Click **"Save and Continue"**
5. On the **Scopes** page, click **"Add or Remove Scopes"**
6. Select:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/tasks`
7. Click **"Update"** → **"Save and Continue"**
8. On **Test users**, add your Google email address
9. Click **"Save and Continue"** → **"Back to Dashboard"**

### Step 4: Create OAuth Credentials

⚠️ **Important:** You need to load the extension first to get its ID!

1. Build and load your extension in Chrome:
   ```bash
   npm run build
   ```
2. Go to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right)
4. Click **"Load unpacked"**
5. Select the `dist` folder from your QuickAdd project
6. **Copy the Extension ID** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

7. Back in Google Cloud Console:
   - Go to **"APIs & Services"** → **"Credentials"**
   - Click **"Create Credentials"** → **"OAuth client ID"**
   - Select **"Chrome Extension"** as application type
   - **Application ID**: Paste your extension ID (without the `chrome-extension://` part)
   - Click **"Create"**

8. **Copy the Client ID** that appears (format: `123456789-abc.apps.googleusercontent.com`)

### Step 5: Update Your Extension

1. Open `manifest.config.ts`
2. Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID:
   ```typescript
   oauth2: {
     client_id: '123456789-abc.apps.googleusercontent.com', // Your actual Client ID
     scopes: [
       'https://www.googleapis.com/auth/calendar.events',
       'https://www.googleapis.com/auth/tasks'
     ]
   },
   ```

3. Rebuild the extension:
   ```bash
   npm run build
   ```

4. Go to `chrome://extensions/` and click the **reload icon** on your extension

---

## 2. Get Free AI API Key (Google Gemini)

Google Gemini offers a **free tier** with 15 requests per minute, perfect for QuickAdd!

### Step 1: Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click **"Get API Key"**
3. Click **"Create API key in new project"** (or select existing project)
4. **Copy your API key** (format: `AIzaSy...`)
5. Keep this key safe - you'll enter it in the extension settings

### Alternative: Hugging Face (Also Free)

If you prefer Hugging Face:

1. Go to [Hugging Face](https://huggingface.co/settings/tokens)
2. Click **"New token"**
3. Name it **"QuickAdd"** and select **"Read"** permission
4. Click **"Generate"**
5. Copy the token (format: `hf_...`)

---

## 3. Configure Your Extension

### Step 1: Open Extension Settings

1. Click the **QuickAdd icon** in your Chrome toolbar
2. Right-click → **"Options"** (or click "Settings" in the popup)

### Step 2: Connect to Google

1. In the settings page, click **"Connect to Google"**
2. You'll see a Google sign-in popup
3. **Select your Google account**
4. Review the permissions (Calendar and Tasks access)
5. Click **"Allow"**
6. You should see **"Successfully connected to Google!"**

### Step 3: Configure AI Enhancement (Optional but Recommended)

1. In the settings page, find the **AI Enhancement** section
2. Toggle **"Enable AI Enhancement"** to ON
3. Select **"Gemini"** as the provider (or Hugging Face if you prefer)
4. **Paste your API key** in the API Key field
5. Click **"Save Settings"**

### Step 4: Set Default Provider

1. In the **"Default Provider"** dropdown, select:
   - **Google Calendar** (for events)
   - **Google Tasks** (for tasks)
2. The extension will remember your choice

---

## 4. Testing the Extension

### Test 1: Create a Calendar Event

1. Go to any webpage (e.g., Gmail, news site)
2. **Highlight this text**: `Team meeting tomorrow at 2pm for 1 hour`
3. Press **Alt+Shift+Q** (or right-click → "Add to Calendar")
4. You should see a confirmation card with:
   - Title: "Team meeting"
   - Date/Time: Tomorrow at 2:00 PM
   - Duration: 1 hour
5. Click **"Yes"**
6. Check your **Google Calendar** - the event should appear!

### Test 2: Create a Task

1. **Highlight this text**: `Submit project report by Friday`
2. Press **Alt+Shift+T** (force task creation)
3. You should see a confirmation card with:
   - Title: "Submit project report"
   - Due: This Friday
4. Click **"Yes"**
5. Check your **Google Tasks** - the task should appear!

### Test 3: AI Enhancement

If you enabled AI enhancement, try a more complex example:

1. **Highlight this text**: 
   ```
   Flight to NYC on Dec 15 at 6:30 AM from SFO, 
   arriving JFK at 3 PM. Confirmation: ABC123
   ```
2. Press **Alt+Shift+Q**
3. The AI should extract:
   - Title: "Flight to NYC"
   - Location: "SFO → JFK"
   - Date/Time: Dec 15, 6:30 AM
   - Notes: Confirmation number
4. Click **"Yes"**
5. Check your calendar!

---

## Keyboard Shortcuts

- **Alt+Shift+Q**: Smart Add (auto-detect event or task)
- **Alt+Shift+C**: Force create as Calendar Event
- **Alt+Shift+T**: Force create as Task

You can customize these in `chrome://extensions/shortcuts`

---

## Troubleshooting

### "Authentication failed" error

1. Make sure you added your email as a **Test User** in OAuth consent screen
2. Make sure the **Client ID** in `manifest.config.ts` matches exactly
3. Try removing the extension and reloading it

### "API Error: Invalid credentials"

1. Verify your Client ID is correct
2. Make sure the extension ID hasn't changed (happens when you reload)
3. If the ID changed, create new OAuth credentials with the new ID

### AI not working

1. Check your API key is correct (no extra spaces)
2. Verify you haven't exceeded the free tier limits:
   - Gemini: 15 requests/minute
   - Hugging Face: varies by model
3. Check the browser console for errors (F12 → Console tab)

### Events not appearing in Calendar

1. Make sure you selected **"Google Calendar"** as default provider
2. Check if you have multiple Google accounts - it uses your default
3. Look for the event in "Other calendars" or your primary calendar

---

## Privacy & API Keys

- **Google OAuth**: Tokens are stored securely by Chrome
- **AI API Keys**: Stored locally in your browser (never sent to third parties)
- **All parsing happens locally** unless you enable AI enhancement
- **No data is collected** unless you enable telemetry in settings

---

## Next Steps

1. **Customize defaults** in Settings:
   - Default event duration
   - Default reminder time
   - Task due time

2. **Try different text formats**:
   - "Call with John next Monday 3-4pm"
   - "Dentist appointment Feb 10 at 10am"
   - "Buy groceries today"
   - "Review PR #123 by end of week"

3. **Explore advanced features** (coming soon):
   - Recurring events
   - Multiple attendees
   - Voice confirmation
   - Microsoft 365 integration

---

## Support

If you encounter issues:

1. Check the browser console (F12 → Console) for errors
2. Review the [PRD document](./README.md) for expected behavior
3. Verify all API keys and credentials are correct
4. Try disabling AI enhancement to isolate the issue

---

## API Rate Limits (Free Tiers)

### Google Calendar & Tasks API
- **Quota**: 1,000,000 requests/day
- **Rate**: 10 requests/second
- **Cost**: FREE

### Google Gemini API
- **Quota**: 15 requests/minute, 1,500 requests/day
- **Cost**: FREE
- **Upgrade**: Gemini Pro is also available for higher limits

### Hugging Face
- **Quota**: Varies by model (typically 1000+ requests/day)
- **Cost**: FREE
- **Note**: May have slower response times on free tier

---

## Congratulations! 🎉

Your QuickAdd extension is now fully configured with:
- ✅ Google Calendar integration
- ✅ Google Tasks integration
- ✅ AI-powered text parsing
- ✅ Smart event/task detection

Start highlighting text and watch your calendar fill up automatically!
