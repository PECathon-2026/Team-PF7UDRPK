import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';

// Restore all mocks after each test to prevent cross-test contamination
afterEach(() => {
  vi.restoreAllMocks();
});
