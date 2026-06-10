import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

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
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: cfg().bucket,
      Key: fileKey(storedName),
    }),
  );
  return Buffer.from(await response.Body!.transformToByteArray());
}

export async function getObjectStream(storedName: string): Promise<Readable> {
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: cfg().bucket,
      Key: fileKey(storedName),
    }),
  );
  return response.Body as Readable;
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
    const response = await getClient().send(
      new GetObjectCommand({
        Bucket: cfg().bucket,
        Key: thumbKey(storedName),
      }),
    );
    return Buffer.from(await response.Body!.transformToByteArray());
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
