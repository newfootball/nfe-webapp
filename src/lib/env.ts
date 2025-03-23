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

    // Resend
    RESEND_API_KEY: z.string().min(1),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_FOLDER: z.string().optional(),
  },
  client: {},
  experimental__runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    WEBSITE_URL: process.env.WEBSITE_URL,

    // Resend
    RESEND_API_KEY: process.env.RESEND_API_KEY,

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER,
  },
});
