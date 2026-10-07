import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function pwaBuildManifest(firebaseConfig: Record<string, string> | null) {
  return {
    name: 'mfc-pwa-build-manifest',
    apply: 'build' as const,
    closeBundle() {
      const outputDirectory = fileURLToPath(new URL('./dist', import.meta.url));
      const workerPath = join(outputDirectory, 'sw.js');
      const indexHtml = readFileSync(join(outputDirectory, 'index.html'), 'utf8');
      const entryMatch = indexHtml.match(/\/assets\/index-([^".]+)\.js/);
      const buildVersion = entryMatch?.[1] ?? `build-${Date.now()}`;

      writeFileSync(join(outputDirectory, 'build-meta.json'), JSON.stringify({
        version: buildVersion,
        builtAt: new Date().toISOString(),
      }, null, 2));

      const files: string[] = [];
      const collectFiles = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const absolutePath = join(directory, entry.name);
          if (entry.isDirectory()) collectFiles(absolutePath);
          else if (entry.name !== 'sw.js') files.push(`/${relative(outputDirectory, absolutePath).split(sep).join('/')}`);
        }
      };
      collectFiles(outputDirectory);

      const workerSource = readFileSync(workerPath, 'utf8')
        .replace("const BUILD_VERSION = 'dev-build';", `const BUILD_VERSION = ${JSON.stringify(buildVersion)};`)
        .replace("const PRECACHE_URLS = ['/'];", `const PRECACHE_URLS = ${JSON.stringify(['/', ...files])};`)
        .replace('const FIREBASE_CONFIG = null;', `const FIREBASE_CONFIG = ${JSON.stringify(firebaseConfig)};`);
      writeFileSync(workerPath, workerSource);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const webConfig = { apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyD9wsFQAIbbWF1oMiO5GWGckpFFBKwNcoU', authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'marvel-gym-remainder.firebaseapp.com', projectId: env.VITE_FIREBASE_PROJECT_ID || 'marvel-gym-remainder', storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'marvel-gym-remainder.firebasestorage.app', messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1092260295232', appId: env.VITE_FIREBASE_APP_ID || '1:1092260295232:web:9db184715203dcacea25a5' };
  const firebaseConfig = webConfig.apiKey && webConfig.projectId && webConfig.messagingSenderId && webConfig.appId ? webConfig : null;
  return {
  plugins: [react(), pwaBuildManifest(firebaseConfig)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  };
});
