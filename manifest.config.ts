import 'dotenv/config';
import { defineManifest } from '@crxjs/vite-plugin';

const googleClientId =
  process.env.GOOGLE_CLIENT_ID ?? '997585536895-gn5a8o3s8ssck3e3ifn9spd3l7dqcgl7.apps.googleusercontent.com';
const oauthScopes = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
];

export default defineManifest({
  manifest_version: 3,
  name: 'QuickAdd',
  description: 'Turn highlighted text into calendar events or tasks in a single confirmation.',
  version: '0.1.0',
  minimum_chrome_version: '114',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  action: {
    default_title: 'QuickAdd',
    default_popup: 'src/popup/index.html'
  },
  icons: {
    '16': 'public/icons/icon-16.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png'
  },
  permissions: ['activeTab', 'storage', 'identity', 'contextMenus', 'downloads'],
  oauth2: {
    client_id: googleClientId,
    scopes: oauthScopes
  },
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
      all_frames: true,
      match_about_blank: true
    }
  ],
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true
  },
  commands: {
    'smart-capture': {
      suggested_key: {
        default: 'Alt+Shift+Q'
      },
      description: 'Smart Add: infer task or event from selection'
    },
    'force-event': {
      suggested_key: {
        default: 'Alt+Shift+C'
      },
      description: 'Force Event creation from selection'
    },
    'force-task': {
      suggested_key: {
        default: 'Alt+Shift+T'
      },
      description: 'Force Task creation from selection'
    }
  }
});
