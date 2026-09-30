/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: ["xlsx"],
};

export default config;

initOpenNextCloudflareForDev();
