/**
 * Server-only re-export with an extra runtime guard.
 *
 * Import this in every server-only module to get the standard 'server-only'
 * null export *plus* a runtime check that throws if the module is accidentally
 * bundled into client code.
 */

// eslint-disable-next-line import/no-unassigned-import
import "server-only";

/**
 * Throws if called inside a browser / client bundle.
 * Call once at module top-level in every server-only file.
 *
 * The heuristic: if `window` is defined we're on the client.
 * Next.js RSC bundler should have already stripped the file, but
 * this is a defence-in-depth measure.
 */
export function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "server-only module imported on the client — this is a build / bundling error",
    );
  }
}
