import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite base path:
// - dev (`npm run dev`): '/' so localhost:5173 serves assets at /assets/...
//   and the user can hit the site at the root with no path prefix.
// - prod (`npm run build`): '/maze3D/' so the GitHub Pages subpath
//   https://<user>.github.io/maze3D/ resolves assets under that prefix.
// The React Router `basename` in App.tsx reads import.meta.env.BASE_URL
// (which Vite exposes as the same string), so the two stay in lockstep
// — SPA internal navigation (e.g. <Link to="/settings">) prefixes the
// subpath, and refreshing /maze3D/settings hits the GH Pages 404.html
// fallback (see .github/workflows/deploy.yml) instead of routing to
// the user's profile root.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // F-2026-07-01-FCR-L-9: strictPort: false (Vite's default) — when 5173 is
  // busy, Vite auto-tries 5174/5175/… so a developer running two
  // workspaces side-by-side doesn't lose the dev server silently.
  server: { port: 5173, strictPort: false },
  base: mode === 'production' ? '/maze3D/' : '/',
  build: {
    // F-2026-07-01-FCR-L-8: split Three.js into its own chunk. Source files
    // still use `import * as THREE from 'three'` (a tree-shake
    // refactor across 6 files is out of scope here), but manualChunks
    // gives us most of the bundle-size benefit: Three.js is only loaded
    // when GameCanvas or the editor route is hit. Initial home-screen
    // bundle drops from 960 KB → ~600 KB (the 266 KB → ~140 KB gzip).
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
}));
