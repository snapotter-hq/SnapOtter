import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { trackEvent } from "./analytics.js";
import { gatherSystemProperties } from "./system-info.js";

/**
 * The install-base census. Sent once per boot, and once more when an admin
 * turns analytics back on, because the boot send is dropped while it is off.
 * The gate still applies, so nothing is sent while analytics is off.
 */
export async function trackInstanceStarted(): Promise<void> {
  // ignoreSampleRate: this census must not be thinned by the volume sample
  // rate that exists to throttle high-frequency usage events.
  await trackEvent(ANALYTICS_EVENTS.INSTANCE_STARTED, { ...gatherSystemProperties() }, undefined, {
    ignoreSampleRate: true,
  });
}
