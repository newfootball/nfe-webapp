import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z
      .string()
      .url()
      .min(1)
      .regex(RegExp("postgres(ql)?://(.*):(.*)@(.*)/(.*)")),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_ANALYTICS_ID: z.string().optional(),
    NEXTAUTH_SECRET: z.string().optional(),
    WEBSITE_URL: z.string().url().min(1).startsWith("https://").optional(),

    // MinIO
    MINIO_ENDPOINT: z.string().url().min(1).optional(),
    MINIO_USE_SSL: z.string().optional(),
    MINIO_ACCESS_KEY: z.string().optional(),
    MINIO_SECRET_KEY: z.string().optional(),
    MINIO_BUCKET_NAME: z.string().optional(),

    // Resend
    RESEND_API_KEY: z.string().min(1),
  },
  client: {},
  experimental__runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    WEBSITE_URL: process.env.WEBSITE_URL,

    // MinIO
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
    MINIO_USE_SSL: process.env.MINIO_USE_SSL,
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
    MINIO_BUCKET_NAME: process.env.MINIO_BUCKET_NAME,

    // Resend
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  },
});
