import { S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION || "eu-north-1";
console.log(`[S3] Initializing client with region: ${region}`);

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
