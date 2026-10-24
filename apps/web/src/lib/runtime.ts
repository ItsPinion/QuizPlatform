import {
  developmentFeaturesEnabled,
  readRuntimeMode,
  runtimeModeDescription,
  runtimeModeLabel,
  type RuntimeMode,
} from '@quiz/shared/environment';

/**
 * The web app's view of `ENV_NODE`.
 *
 * Server-only, on purpose. The decision this module exports changes *what is
 * rendered*, and the API is the authority on it: the login page and the landing
 * page read `runtime.demoFeatures` from `/api/landing`, so a demo login can
 * never appear because of a variable the API disagrees with. This module covers
 * the other half — the build-plan badges the console pages print, which have no
 * API payload to hang off.
 *
 * Both processes read the same `.env` in the shipped setup, and
 * `/admin/system` prints the API's resolved mode next to the web's, so a split
 * environment is visible rather than silently half-on.
 *
 * Import it from server components only. A client component importing this
 * would get `undefined` for both variables — `process.env` is inlined for
 * `NEXT_PUBLIC_*` alone — and would therefore hide the badges in development.
 */
const reading = readRuntimeMode({
  ENV_NODE: process.env.ENV_NODE,
  NODE_ENV: process.env.NODE_ENV,
});

export const runtimeMode: RuntimeMode = reading.mode;

/** Demo logins, build-plan badges, preview hosts: development and demo only. */
export const developmentFeatures: boolean = developmentFeaturesEnabled(runtimeMode);

export const runtimeModeTitle: string = runtimeModeLabel(runtimeMode);
export const runtimeModeSummary: string = runtimeModeDescription(runtimeMode);
