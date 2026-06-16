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
  server: { port: 5173 },
  base: mode === 'production' ? '/maze3D/' : '/',
}));
