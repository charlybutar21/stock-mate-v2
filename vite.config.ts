import path from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              if (id.includes('react-dom') || id.includes('react-router') || /[/\\]react[/\\]/.test(id)) {
                return 'react-vendor';
              }
              if (id.includes('@tanstack/react-query')) {
                return 'query-vendor';
              }
              if (id.includes('lucide-react')) {
                return 'icons-vendor';
              }
              if (id.includes('zod')) {
                return 'validation-vendor';
              }
              return undefined;
            },
          },
        },
      },
    },
  },
});
