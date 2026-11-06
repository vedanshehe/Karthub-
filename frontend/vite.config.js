import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// /api calls are forwarded to the Express backend, so no CORS or URL settings are needed
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } } });
