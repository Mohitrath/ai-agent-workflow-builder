import { NhostClient } from "@nhost/nhost-js";

// Keep the client constructible during Next.js build/prerender.
// Real values must be supplied in Vercel environment variables at runtime.
const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "build-placeholder";
const region = process.env.NEXT_PUBLIC_NHOST_REGION || "local";

export const nhost = new NhostClient({
  subdomain,
  region,
});
