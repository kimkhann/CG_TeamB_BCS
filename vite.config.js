import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 등 하위 경로 배포를 대비해 상대 경로로 빌드합니다.
  base: './',
  server: { open: true },
});
