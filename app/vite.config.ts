import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Couleurs de l'app (doivent rester identiques à celles de style.css)
const COULEUR_FOND = '#0f1417';
const COULEUR_ACCENT = '#0e7c86';

export default defineConfig({
  // "./" = chemins relatifs : l'app marche quel que soit le nom du dépôt GitHub
  base: './',
  define: {
    // Date et heure de fabrication, affichées dans l'app pour vérifier la version installée
    __BUILD_ISO__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    preact(),
    VitePWA({
      // "prompt" = l'app propose la mise à jour, elle ne recharge jamais toute seule
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'On fait quoi ?',
        short_name: 'On fait quoi ?',
        description: 'Planifier un voyage : quoi faire, et quand.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: COULEUR_FOND,
        theme_color: COULEUR_ACCENT,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout ce qui est fabriqué est mis en cache pour le mode avion
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
