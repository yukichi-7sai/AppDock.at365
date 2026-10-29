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
        commandPalette: 'src/renderer/command-palette/index.html',
        gestureIndicator: 'src/renderer/gesture-indicator.html',
      },
    },
  },
});
