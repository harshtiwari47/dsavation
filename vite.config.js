import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApiNode } from './server/api.js';

function localApi() {
  return {
    name: 'dsavation-local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        return handleApiNode(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return { plugins: [react(), localApi()] };
});
