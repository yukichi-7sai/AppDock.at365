import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: 'shells/default',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../out/shells/default',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        bars: path.resolve('shells/default/bars.html'),
        ribbon: path.resolve('shells/default/index.html'),
        overlay: path.resolve('shells/default/overlay.html'),
        notifications: path.resolve('shells/default/notifications.html'),
      },
    },
  },
});
