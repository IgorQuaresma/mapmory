import { CreateBucketCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config';

export interface ObjectStore {
  signedDownloadUrl(key: string, filename: string, contentType: string): Promise<string>;
  deleteObjects(keys: string[]): Promise<void>;
  ensureBucket(): Promise<void>;
}

/** Private bucket; downloads only via short-lived signed URLs (plan §8.1). */
export function createObjectStore(config: Config): ObjectStore {
  const make = (endpoint: string | undefined) =>
    new S3Client({
      endpoint,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    });
  const client = make(config.S3_ENDPOINT);
  // Signing is offline; a second client only changes the host in the URL handed to browsers.
  const signer = config.S3_PUBLIC_ENDPOINT ? make(config.S3_PUBLIC_ENDPOINT) : client;
  const Bucket = config.S3_BUCKET;
  return {
    signedDownloadUrl(key, filename, contentType) {
      const safeName = filename.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'mapmory-poster';
      return getSignedUrl(
        signer,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${safeName}"`,
          ResponseContentType: contentType,
        }),
        { expiresIn: 15 * 60 },
      );
    },
    async deleteObjects(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        if (chunk.length === 0) continue;
        await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
      }
    },
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
  };
}
