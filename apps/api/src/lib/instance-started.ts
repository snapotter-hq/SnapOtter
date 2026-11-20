import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { trackEvent } from "./analytics.js";
import { gatherSystemProperties } from "./system-info.js";

/**
 * The install-base census. Sent once per boot, and once more by the settings
 * write that answers a fresh install's analytics prompt, because the boot send
 * was dropped while nobody had decided (#5014). The gate still applies, so a
 * "no" answer sends nothing.
 */
export async function trackInstanceStarted(): Promise<void> {
  // ignoreSampleRate: this census must not be thinned by the volume sample
  // rate that exists to throttle high-frequency usage events.
  await trackEvent(ANALYTICS_EVENTS.INSTANCE_STARTED, { ...gatherSystemProperties() }, undefined, {
    ignoreSampleRate: true,
  });
}
