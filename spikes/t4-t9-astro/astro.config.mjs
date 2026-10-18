import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  security: process.env.SPIKE_CSP === '1' ? { csp: true } : undefined,
});
