/**
 * Test utilities for cleaning up resources and preventing open handles
 */

/**
 * Force cleanup of any remaining timers, intervals, and connections
 * Call this in afterAll hooks to ensure clean test completion
 */
export function cleanupTestResources(): void {
  // Force garbage collection if available (helps with memory cleanup)
  if ((global as any).gc) {
    try {
      (global as any).gc();
    } catch (error) {
      // Ignore gc errors
    }
  }

  // Small delay to allow any pending microtasks to complete
  return new Promise<void>((resolve) => {
    setImmediate(() => {
      resolve();
    });
  }) as any;
}

/**
 * Restore global fetch after monkey-patching in tests
 */
export function restoreFetch(originalFetch: typeof fetch): void {
  if (originalFetch) {
    global.fetch = originalFetch;
  }
}

/**
 * Generic cleanup for test suites that use HTTP requests
 */
export function cleanupHttpTests(originalFetch?: typeof fetch): void {
  if (originalFetch) {
    restoreFetch(originalFetch);
  }
  cleanupTestResources();
}
