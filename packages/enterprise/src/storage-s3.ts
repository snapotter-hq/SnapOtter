import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export interface S3Config {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  prefix: string;
}

let config: S3Config | null = null;
let client: S3Client | null = null;

export function configureS3(opts: S3Config): void {
  config = opts;
  client = null; // Reset so next getClient() picks up new config
}

function cfg(): S3Config {
  if (!config) {
    throw new Error("S3 storage not configured. Call configureS3() first.");
  }
  return config;
}

function getClient(): S3Client {
  if (!client) {
    const c = cfg();
    client = new S3Client({
      region: c.region,
      endpoint: c.endpoint || undefined,
      forcePathStyle: c.forcePathStyle,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
    });
  }
  return client;
}

function fileKey(storedName: string): string {
  const prefix = cfg().prefix ? `${cfg().prefix}/` : "";
  return `${prefix}files/${storedName}`;
}

function thumbKey(storedName: string): string {
  const prefix = cfg().prefix ? `${cfg().prefix}/` : "";
  return `${prefix}thumbs/${storedName}.thumb.jpg`;
}

function requireObjectBody(response: GetObjectCommandOutput, key: string) {
  if (!response.Body) {
    throw new Error(`S3 object response for ${key} did not include a body`);
  }
  return response.Body;
}

export async function checkConnection(): Promise<void> {
  await getClient().send(new HeadBucketCommand({ Bucket: cfg().bucket }));
}

export async function putObject(storedName: string, buffer: Buffer): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: cfg().bucket,
      Key: fileKey(storedName),
      Body: buffer,
    }),
  );
}

export async function getObject(storedName: string): Promise<Buffer> {
  const key = fileKey(storedName);
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: cfg().bucket,
      Key: key,
    }),
  );
  return Buffer.from(await requireObjectBody(response, key).transformToByteArray());
}

export async function getObjectStream(storedName: string): Promise<Readable> {
  const key = fileKey(storedName);
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: cfg().bucket,
      Key: key,
    }),
  );
  return requireObjectBody(response, key) as Readable;
}

export async function deleteObject(storedName: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: cfg().bucket,
        Key: fileKey(storedName),
      }),
    );
  } catch {
    // Object already gone or doesn't exist
  }
}

export async function getThumbnail(storedName: string): Promise<Buffer | null> {
  try {
    const key = thumbKey(storedName);
    const response = await getClient().send(
      new GetObjectCommand({
        Bucket: cfg().bucket,
        Key: key,
      }),
    );
    return Buffer.from(await requireObjectBody(response, key).transformToByteArray());
  } catch {
    return null;
  }
}

export async function putThumbnail(storedName: string, buffer: Buffer): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: cfg().bucket,
      Key: thumbKey(storedName),
      Body: buffer,
      ContentType: "image/jpeg",
    }),
  );
}

export async function deleteThumbnail(storedName: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: cfg().bucket,
        Key: thumbKey(storedName),
      }),
    );
  } catch {
    // Thumbnail may not exist
  }
}

// ---------------------------------------------------------------------------
// Generic object operations for uploads/ and outputs/ processing artifacts.
// Called by apps/api/src/lib/object-storage.ts when STORAGE_MODE=s3.
// Keys are passed verbatim (e.g. "outputs/<jobId>/result.png") and joined
// with the configured S3_PREFIX, consistent with fileKey/thumbKey above.
// ---------------------------------------------------------------------------

export interface GenericObjectInfo {
  key: string;
  size: number;
  mtimeMs: number;
}

function genericKey(key: string): string {
  const prefix = cfg().prefix ? `${cfg().prefix}/` : "";
  return `${prefix}${key}`;
}

export async function putGenericObject(key: string, data: Buffer): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: cfg().bucket,
      Key: genericKey(key),
      Body: data,
    }),
  );
}

export async function putGenericObjectStream(
  key: string,
  source: AsyncIterable<Buffer>,
  signal?: AbortSignal,
): Promise<void> {
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: cfg().bucket,
      Key: genericKey(key),
      // @aws-sdk/lib-storage Upload only accepts string|Uint8Array|Buffer|Readable|
      // ReadableStream|Blob. A bare AsyncIterable (the counter() generator from
      // object-storage.putObjectStream) is none of those, so S3 uploads failed with
      // "Body Data is unsupported format". Wrap it in a real Node Readable.
      Body: Readable.from(source),
    },
  });
  const abortUpload = () => {
    void upload.abort().catch(() => {});
  };
  signal?.addEventListener("abort", abortUpload, { once: true });
  if (signal?.aborted) abortUpload();
  try {
    await upload.done();
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener("abort", abortUpload);
  }
}

export async function getGenericObjectStream(
  key: string,
  range?: { start: number; end?: number },
): Promise<Readable> {
  const params: { Bucket: string; Key: string; Range?: string } = {
    Bucket: cfg().bucket,
    Key: genericKey(key),
  };
  if (range) {
    params.Range = `bytes=${range.start}-${range.end ?? ""}`;
  }
  const response = await getClient().send(new GetObjectCommand(params));
  return response.Body as Readable;
}

export async function getGenericObjectSize(key: string): Promise<number> {
  const response = await getClient().send(
    new HeadObjectCommand({
      Bucket: cfg().bucket,
      Key: genericKey(key),
    }),
  );
  return response.ContentLength ?? 0;
}

export async function deleteGenericObject(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: cfg().bucket,
        Key: genericKey(key),
      }),
    );
  } catch {
    // Object already gone or doesn't exist
  }
}

export async function deleteGenericPrefix(prefix: string): Promise<void> {
  const fullPrefix = genericKey(prefix.endsWith("/") ? prefix : `${prefix}/`);
  let continuationToken: string | undefined;
  do {
    const list = await getClient().send(
      new ListObjectsV2Command({
        Bucket: cfg().bucket,
        Prefix: fullPrefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (list.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    if (keys.length > 0) {
      // DeleteObjects supports up to 1000 keys per call
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        const deleteResult = await getClient().send(
          new DeleteObjectsCommand({
            Bucket: cfg().bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          }),
        );
        if (deleteResult.Errors && deleteResult.Errors.length > 0) {
          const summary = deleteResult.Errors.map((e) => `${e.Key}: ${e.Code}`).join(", ");
          throw new Error(`S3 DeleteObjects partial failure: ${summary}`);
        }
      }
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
}

export async function listGenericObjects(prefix: string): Promise<GenericObjectInfo[]> {
  const fullPrefix = genericKey(prefix.endsWith("/") ? prefix : `${prefix}/`);
  const s3Prefix = cfg().prefix ? `${cfg().prefix}/` : "";
  const out: GenericObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const list = await getClient().send(
      new ListObjectsV2Command({
        Bucket: cfg().bucket,
        Prefix: fullPrefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of list.Contents ?? []) {
      if (!obj.Key) continue;
      // Strip the S3_PREFIX to return keys in the caller's namespace
      const key =
        s3Prefix && obj.Key.startsWith(s3Prefix) ? obj.Key.slice(s3Prefix.length) : obj.Key;
      out.push({
        key,
        size: obj.Size ?? 0,
        mtimeMs: obj.LastModified ? obj.LastModified.getTime() : 0,
      });
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return out;
}

// Lists the top-level "job directories" under a prefix (uploads/ or outputs/).
// Uses ListObjectsV2 with Delimiter="/" to get CommonPrefixes. S3 does not
// store directory mtime, so we set mtimeMs=0. The TTL sweeper should instead
// rely on the jobs table's updatedAt column for expiry decisions; this listing
// only provides the directory keys for matching against job records.
export async function listGenericJobDirs(
  prefix: "uploads" | "outputs",
): Promise<GenericObjectInfo[]> {
  const fullPrefix = genericKey(`${prefix}/`);
  const s3Prefix = cfg().prefix ? `${cfg().prefix}/` : "";
  const out: GenericObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const list = await getClient().send(
      new ListObjectsV2Command({
        Bucket: cfg().bucket,
        Prefix: fullPrefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const cp of list.CommonPrefixes ?? []) {
      if (!cp.Prefix) continue;
      // Strip S3_PREFIX and trailing slash to normalize: "outputs/jobId"
      let key =
        s3Prefix && cp.Prefix.startsWith(s3Prefix) ? cp.Prefix.slice(s3Prefix.length) : cp.Prefix;
      key = key.replace(/\/$/, "");
      out.push({ key, size: 0, mtimeMs: 0 });
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return out;
}
