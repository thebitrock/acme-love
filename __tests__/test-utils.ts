/**
 * Test utilities for cleaning up resources and preventing open handles
 */

/**
 * Force cleanup of any remaining timers, intervals, and connections
 * Call this in afterAll hooks to ensure clean test completion
 */
export function cleanupTestResources(): Promise<void> {
  // Clear any remaining timers
  const clearAllTimers = () => {
    let id = 1;
    while (id < 1000) {
      clearTimeout(id);
      clearInterval(id);
      id++;
    }
  };
  
  clearAllTimers();

  // Force garbage collection if available (helps with memory cleanup)
  if ((global as any).gc) {
    try {
      (global as any).gc();
    } catch (error) {
      // Ignore gc errors
    }
  }

  // Allow any pending microtasks to complete
  return new Promise<void>((resolve) => {
    setImmediate(() => {
      setImmediate(() => {
        resolve();
      });
    });
  });
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
export async function cleanupHttpTests(originalFetch?: typeof fetch): Promise<void> {
  if (originalFetch) {
    restoreFetch(originalFetch);
  }
  await cleanupTestResources();
}
