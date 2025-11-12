/**
 * Load environment variables FIRST before anything else
 * This must be imported before any other modules that depend on process.env
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in project root
const envPath = path.resolve(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath });

if (result.error && (result.error as any).code !== 'ENOENT') {
  console.error('[ENV LOADER ERROR]', result.error);
  process.exit(1);
} else if (result.parsed) {
  console.log('[ENV LOADER SUCCESS] .env file loaded');
  console.log('[ENV LOADER] ENABLED_SERVICES:', result.parsed.ENABLED_SERVICES || 'NOT SET');
} else {
  console.warn('[ENV LOADER] Warning: .env file not found at', envPath);
  console.warn('[ENV LOADER] Using system environment variables or defaults');
}

export default result;
