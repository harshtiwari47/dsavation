import { defineConfig, loadEnv } from 'vite';
import { createMarkHandler } from './server/mark-api.js';

function markingPasswordApi(secret) {
  return {
    name: 'technovation-marking-password',
    configureServer(server) {
      server.middlewares.use('/api/mark', createMarkHandler(secret));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return { plugins: [markingPasswordApi(env.DSA_MARK_PASSWORD)] };
});
