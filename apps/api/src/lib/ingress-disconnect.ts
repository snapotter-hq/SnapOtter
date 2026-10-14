import type { FastifyReply, FastifyRequest } from "fastify";
import { requestCancel } from "../jobs/cancel.js";
import { cancelSingleJobGuarded } from "../routes/progress.js";
import { deleteObject } from "./object-storage.js";

interface DisconnectLogger {
  warn?: (obj: object, msg: string) => void;
}

export interface ClientDisconnectTracker {
  readonly signal: AbortSignal;
  clientGone: () => boolean;
  settleAbandoned: (args: {
    jobId: string;
    clientJobId: string | null;
    uploadKeys: Array<string | null | undefined>;
    log?: DisconnectLogger;
  }) => Promise<void>;
  armCancelAfterEnqueue: (jobId: string, log?: DisconnectLogger) => Promise<boolean>;
  release: () => void;
}

/**
 * Watch for a client hanging up before the 202 response finishes (#2238).
 *
 * Once the multipart body has been read, Node's IncomingMessage never emits
 * "aborted"; a client closing the tab or dropping the network closes the
 * ServerResponse / underlying socket instead. Before enqueue, the route
 * deletes the uploaded files and settles the pre-stamped alias row so it
 * does not stay "queued". If the hangup lands in the gap between the
 * pre-enqueue check and the 202 response finishing, the close listener
 * cancels the enqueued job by its server jobId.
 */
export function trackClientDisconnect(
  request: FastifyRequest,
  reply: FastifyReply,
): ClientDisconnectTracker {
  const abort = new AbortController();
  let enqueuedJobId: string | null = null;
  let cancelRequested = false;
  let postEnqueueLog: DisconnectLogger | undefined;

  const isSocketGone = (): boolean =>
    Boolean(
      request.raw?.aborted ||
        reply.raw?.destroyed ||
        request.raw?.socket?.destroyed ||
        (reply.raw?.closed && !reply.raw?.writableEnded),
    );

  const requestCancelOnce = (jobId: string, log?: DisconnectLogger): Promise<void> => {
    if (cancelRequested) return Promise.resolve();
    cancelRequested = true;
    return requestCancel(jobId)
      .then(() => {})
      .catch((err) => {
        log?.warn?.({ err, jobId }, "Failed to cancel job after client disconnect");
      });
  };

  const onAbort = () => {
    abort.abort();
    if (enqueuedJobId && !reply.raw?.writableEnded) {
      void requestCancelOnce(enqueuedJobId, postEnqueueLog);
    }
  };

  const onFinish = () => {
    reply.raw?.removeListener?.("close", onClose);
  };

  function onClose() {
    reply.raw?.removeListener?.("finish", onFinish);
    if (!reply.raw?.writableEnded) {
      abort.abort();
      if (enqueuedJobId) {
        void requestCancelOnce(enqueuedJobId, postEnqueueLog);
      }
    }
  }

  request.raw?.once?.("aborted", onAbort);
  reply.raw?.once?.("close", onClose);
  if (isSocketGone()) {
    abort.abort();
  }

  const clientGone = (): boolean => {
    if (!abort.signal.aborted && isSocketGone()) {
      abort.abort();
    }
    return abort.signal.aborted;
  };

  const settleAbandoned = async (args: {
    jobId: string;
    clientJobId: string | null;
    uploadKeys: Array<string | null | undefined>;
    log?: DisconnectLogger;
  }): Promise<void> => {
    const uniqueKeys = new Set(
      args.uploadKeys.filter((key): key is string => typeof key === "string" && key.length > 0),
    );
    await Promise.all(
      [...uniqueKeys].map((key) =>
        deleteObject(key).catch((err) => {
          args.log?.warn?.({ err, jobId: args.jobId, key }, "Failed to delete abandoned upload");
        }),
      ),
    );
    if (args.clientJobId && args.clientJobId !== args.jobId) {
      await cancelSingleJobGuarded({
        jobId: args.clientJobId,
        expectedArtifactJobId: args.jobId,
      }).catch((err) => {
        args.log?.warn?.(
          { err, jobId: args.jobId, clientJobId: args.clientJobId },
          "Failed to settle abandoned job alias",
        );
      });
    }
  };

  const armCancelAfterEnqueue = async (jobId: string, log?: DisconnectLogger): Promise<boolean> => {
    enqueuedJobId = jobId;
    postEnqueueLog = log;
    if (clientGone()) {
      await requestCancelOnce(jobId, log);
      return true;
    }
    reply.raw?.once?.("finish", onFinish);
    return false;
  };

  const release = (): void => {
    request.raw?.removeListener?.("aborted", onAbort);
    if (!enqueuedJobId || cancelRequested || reply.raw?.writableEnded) {
      reply.raw?.removeListener?.("close", onClose);
      reply.raw?.removeListener?.("finish", onFinish);
    }
  };

  return {
    signal: abort.signal,
    clientGone,
    settleAbandoned,
    armCancelAfterEnqueue,
    release,
  };
}
