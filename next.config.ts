import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content Security Policy. Next.js dev mode needs 'unsafe-eval' for HMR; production does not.
// Images are served through our own authenticated routes (self) and data: URIs (inline previews).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "sharp",
    "bcryptjs",
    "tesseract.js", // spawns a worker_thread from its own files; must not be bundled
    "playwright", // launches Chromium for payslip PDFs
    "playwright-core",
  ],
  // The OCR engine loads its WASM core and language model by path at runtime, so the
  // standalone build has to carry those files explicitly.
  outputFileTracingIncludes: {
    "/app/[companyId]/attendance/scan": [
      "./node_modules/tesseract.js/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/wasm-feature-detect/**",
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb", // logo uploads
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
