/** Expo SQLite's web VFS holds a pool of OPFS access handles for the worker's
 * entire lifetime, even after a database connection closes. Coordinate the
 * whole pool, not an individual database or SQL transaction.
 */
export const BROWSER_DATABASE_LOCK = "alignment:expo-sqlite:storage-pool:v1";

type LeaseGlobal = typeof globalThis & {
  __alignmentBrowserDatabaseLeaseV1?: Promise<void>;
};

export function acquireBrowserDatabaseLease(): Promise<void> {
  const owner = globalThis as LeaseGlobal;
  if (!owner.__alignmentBrowserDatabaseLeaseV1) {
    owner.__alignmentBrowserDatabaseLeaseV1 = new Promise<void>(
      (resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.locks) {
          reject(
            new Error(
              "This browser cannot coordinate local database access. Use a current browser on localhost or HTTPS.",
            ),
          );
          return;
        }
        void navigator.locks
          .request(BROWSER_DATABASE_LOCK, { mode: "exclusive" }, () => {
            resolve();
            // Deliberately retained until the document is destroyed. Releasing on
            // React unmount or tab hiding would leave the SQLite worker's OPFS handles
            // open while another document attempts to claim them. The browser releases
            // this lock automatically on document destruction, including reload/crash.
            return new Promise<void>(() => {});
          })
          .catch(reject);
      },
    );
  }
  return owner.__alignmentBrowserDatabaseLeaseV1;
}

export function isBrowserDatabaseLockError(error: Error): boolean {
  return /createSyncAccessHandle|another open Access Handle|open Access Handle or Writable stream/i.test(
    error.message,
  );
}
