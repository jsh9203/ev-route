import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => {
  // 루트 .env 의 포트 설정만 읽는다 (키는 브라우저로 넘기지 않음)
  const env = loadEnv(mode, ROOT_DIR, '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.WEB_DEV_PORT || 5173),
      proxy: { '/api': `http://localhost:${env.PORT || 3001}` },
    },
  };
});
