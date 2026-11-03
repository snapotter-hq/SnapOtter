export type AsyncAcceptedPayload = {
  jobId: string;
  async: true;
  statusUrl: string;
  progressUrl: string;
  progressJobId?: string;
  artifactJobId?: string;
};

// The job row and its SSE stream are keyed by the progress id, so both URLs
// derive from the id the client polls with.
export function buildAsyncAcceptedPayload(
  artifactJobId: string,
  clientJobId?: string | null,
): AsyncAcceptedPayload {
  const progressJobId = clientJobId && clientJobId.length > 0 ? clientJobId : artifactJobId;
  const urls = {
    statusUrl: `/api/v1/jobs/${progressJobId}`,
    progressUrl: `/api/v1/jobs/${progressJobId}/progress`,
  };

  if (progressJobId === artifactJobId) {
    return { jobId: artifactJobId, async: true, ...urls };
  }

  return {
    jobId: progressJobId,
    progressJobId,
    artifactJobId,
    async: true,
    ...urls,
  };
}
