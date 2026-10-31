export const XHR_UPLOAD_STALL_TIMEOUT_MS = 120_000;

export interface XhrWatchdog {
  /** Record an `xhr.upload.onprogress` event. */
  onUploadProgress: (event: Pick<ProgressEvent, "lengthComputable" | "loaded" | "total">) => void;
  /** Record `xhr.upload.onload`. */
  onUploadLoad: () => void;
  /** Temporarily clear the active timer on panel unmount without disarming the request. */
  pause: () => void;
  /** Re-arm the current phase's timer when a panel remounts over an in-flight request. */
  resume: () => void;
  /** Disarm and clear any active timer. Safe to call multiple times. */
  clear: () => void;
  /** Arm the upload stall timer and send the request body, disarming if `xhr.send` throws. */
  send: (body?: Document | XMLHttpRequestBodyInit | null) => void;
}

/**
 * Bounds upload stall and post-upload response wait separately on `xhr`
 * instead of setting a single wall-clock `xhr.timeout` across the whole
 * request (#3779, #3870).
 */
export function createXhrWatchdog(
  xhr: XMLHttpRequest,
  responseTimeoutMs: number,
  isActive?: () => boolean,
): XhrWatchdog {
  xhr.timeout = 0;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let uploadedFully = false;
  let lastUploadedBytes = 0;
  let disarmed = false;
  let paused = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const clear = () => {
    disarmed = true;
    clearTimer();
  };

  const fireTimeout = () => {
    timer = null;
    disarmed = true;
    if (isActive && !isActive()) return;
    // Detach onabort before aborting so a simulated timeout never triggers
    // xhr.onabort in place of xhr.ontimeout.
    xhr.onabort = null;
    try {
      xhr.abort();
    } catch (_e) {
      console.debug("Ignored xhr.abort error:", _e);
    }
    xhr.ontimeout?.(new ProgressEvent("timeout"));
  };

  const armUploadStallTimer = () => {
    if (disarmed || paused) return;
    clearTimer();
    timer = setTimeout(fireTimeout, XHR_UPLOAD_STALL_TIMEOUT_MS);
  };

  const armResponseTimer = () => {
    if (disarmed || paused) return;
    clearTimer();
    timer = setTimeout(fireTimeout, responseTimeoutMs);
  };

  return {
    onUploadProgress(event) {
      if (disarmed) return;
      if (event.loaded > lastUploadedBytes) {
        lastUploadedBytes = event.loaded;
        if (!uploadedFully) {
          armUploadStallTimer();
        }
      }
      if (event.lengthComputable && event.loaded >= event.total && !uploadedFully) {
        uploadedFully = true;
        armResponseTimer();
      }
    },
    onUploadLoad() {
      if (disarmed || uploadedFully) return;
      uploadedFully = true;
      armResponseTimer();
    },
    pause() {
      paused = true;
      clearTimer();
    },
    resume() {
      if (disarmed) return;
      paused = false;
      if (timer !== null) return;
      if (uploadedFully) {
        armResponseTimer();
      } else {
        armUploadStallTimer();
      }
    },
    clear,
    send(body) {
      armUploadStallTimer();
      try {
        xhr.send(body);
      } catch (err) {
        clear();
        throw err;
      }
    },
  };
}
