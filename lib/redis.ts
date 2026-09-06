import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL ;
const token = process.env.UPSTASH_REDIS_REST_TOKEN 

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.warn(
    'Warning: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables are missing. Make sure to populate them in .env.local'
  );
}

export const redis = new Redis({
  url,
  token,
});
