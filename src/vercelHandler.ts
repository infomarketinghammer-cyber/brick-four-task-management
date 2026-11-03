/**
 * Vercel serverless entry: every /api/* request is routed here (see scripts/build-vercel.mjs).
 * The Express app and the MongoDB hydration are created once per warm instance and reused.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server';
import { initMongoDB } from './db/mongodb';

let appPromise: Promise<ReturnType<typeof createApp>> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      // Load users/tasks/messages from MongoDB before the first request so logins work on a cold start
      await initMongoDB().catch((err) => {
        console.warn('[MongoDB] Connection error:', err?.message || err);
      });
      return createApp();
    })();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app(req as any, res as any);
}
