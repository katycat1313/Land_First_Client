import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true,
      // Directs HMR WebSocket through standard HTTPS port (443) in production, or uses default local port locally
      hmr: process.env.DISABLE_HMR === 'true' ? false : (process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL" ? { clientPort: 443 } : true),
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/data/**'],
      },
    },
  };
});