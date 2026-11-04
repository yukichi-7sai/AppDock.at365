import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/renderer/index.html',
        ribbon: 'src/renderer/workspace/index.html',
        bars: 'src/renderer/workspace/bars.html',
        overlay: 'src/renderer/workspace/overlay.html',
        notifications: 'src/renderer/workspace/notifications.html',
        commandPalette: 'src/renderer/command-palette/index.html',
        gestureIndicator: 'src/renderer/gesture-indicator.html',
        inputPalette: 'src/renderer/input-palette.html',
      },
    },
  },
});
