// frontend/app/providers.tsx
"use client";

import { ThemeProvider } from './ThemeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
