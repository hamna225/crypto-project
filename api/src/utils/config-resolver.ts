import { config as envConfig } from '../config.js';
import { getSetting } from '../db/client.js';

/**
 * Resolves a configuration value from either:
 * 1. The local SQLite 'user_settings' table (overrides)
 * 2. The process.env via the validated config object
 */
export async function resolveConfig(key: string): Promise<string | undefined> {
  // Check DB first for user-provided settings
  const dbValue = await getSetting(key);
  if (dbValue) return dbValue;

  // Fallback to env config
  return (envConfig as any)[key];
}

/**
 * Convenience check to see if a key is available anywhere
 */
export async function hasConfig(key: string): Promise<boolean> {
  return !!(await resolveConfig(key));
}
