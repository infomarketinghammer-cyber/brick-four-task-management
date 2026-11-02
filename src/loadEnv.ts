/**
 * Loads local environment files before any other module reads process.env.
 * Values already present in the environment (e.g. injected by AI Studio) are never overridden.
 */

import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
