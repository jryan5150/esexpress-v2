/// <reference types="vite/client" />

/**
 * Vite's `import.meta.env` types. Referenced from here so every source
 * file that reads `import.meta.env.VITE_*` gets the proper type instead
 * of TS2339 "Property 'env' does not exist on type 'ImportMeta'".
 *
 * Project-specific env vars below extend Vite's base ImportMetaEnv.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_BUILD_TAG?: string;
  readonly VITE_COMMIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
