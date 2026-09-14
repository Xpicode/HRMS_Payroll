import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "data/**",
    "prisma/migrations/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // Tenant queries must go through repo.ts + scope.ts. This rule flags direct
      // Prisma access outside the allowed files so a scoping slip is caught at lint time.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Import prisma only from repo.ts, seed, or lib/scope.ts. Use scoped() for tenant queries.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/modules/**/repo.ts",
      "src/lib/scope.ts",
      "src/lib/audit.ts",
      "src/lib/auth.ts",
      "src/lib/session.ts",
      "prisma/**/*.ts",
      "src/app/api/**/*.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
]);

export default eslintConfig;
