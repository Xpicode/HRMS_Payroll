"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Dark by default (the Linear-style theme); light and system are one click away in the account menu. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
