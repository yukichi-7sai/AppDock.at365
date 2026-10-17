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
        ribbon: path.resolve('shells/default/index.html'),
        overlay: path.resolve('shells/default/overlay.html'),
        logs: path.resolve('shells/default/logs.html'),
        home: path.resolve('shells/default/home.html'),
        notificationCenter: path.resolve('shells/default/notification-center.html'),
        notifications: path.resolve('shells/default/notifications.html'),
      },
    },
  },
});
