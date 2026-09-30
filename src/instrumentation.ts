export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    // Next loads this file for every runtime. The dynamic import keeps the
    // file watcher and JSON store out of the edge bundle.
    const { startBackground } = await import("~/server/store");
    await startBackground();
  }
}
