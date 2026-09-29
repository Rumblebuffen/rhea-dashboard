import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative base so the build works at https://<user>.github.io/<repo>/ and locally without changes.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
