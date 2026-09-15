import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// The origin users reach the app on. Browsers upgrade every sub-resource to https when the
// CSP carries upgrade-insecure-requests, so that directive is only sent when the app is
// actually served over TLS (a plain-http LAN address would otherwise load no CSS or JS).
const servedOverTls = (process.env.AUTH_URL ?? "").startsWith("https://");
// Dev only: hosts (other than localhost) allowed to load /_next assets from the dev server,
// e.g. another PC on the LAN. Comma-separated, glob patterns allowed ("192.168.0.*").
const devOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
  ...(servedOverTls ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd && servedOverTls
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: "standalone",
  ...(devOrigins.length > 0 && !isProd ? { allowedDevOrigins: devOrigins } : {}),
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
