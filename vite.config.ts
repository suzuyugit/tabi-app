/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages のサブパス（/<リポジトリ名>/）でも動くよう相対パスにする
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
