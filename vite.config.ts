/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages のサブパス（/<リポジトリ名>/）でも動くよう相対パスにする
  base: './',
  plugins: [
    react(),
    // PWA：ホーム画面に追加でき、電波がなくても開ける（アプリのファイルを Service Worker でキャッシュする）
    VitePWA({
      registerType: 'prompt', // 新しい版は「更新」を押したときに入れ替える（入力中に勝手に再読み込みしない）
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'たびメモ',
        short_name: 'たびメモ',
        description: '旅程と旅のお金をスマホ1台で。割り勘の精算まで。',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f766e',
        background_color: '#f6f7f8',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
