import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: '#08080f',
        bg2: '#0f0f1a',
        surface: 'rgba(255,255,255,0.04)',
        accent: '#7c6ff7',
        accent2: '#a78bfa',
        green: '#22d47a',
        red: '#f04f5c',
        blue: '#5b8ef0',
      },
    },
  },
  plugins: [],
};

export default config;
