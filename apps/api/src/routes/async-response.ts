export type AsyncAcceptedPayload = {
  jobId: string;
  async: true;
  progressJobId?: string;
  artifactJobId?: string;
};

export function buildAsyncAcceptedPayload(
  artifactJobId: string,
  clientJobId?: string | null,
): AsyncAcceptedPayload {
  const progressJobId = clientJobId && clientJobId.length > 0 ? clientJobId : artifactJobId;

  if (progressJobId === artifactJobId) {
    return { jobId: artifactJobId, async: true };
  }

  return {
    jobId: progressJobId,
    progressJobId,
    artifactJobId,
    async: true,
  };
}
