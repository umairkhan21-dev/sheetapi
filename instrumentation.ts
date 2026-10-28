export async function register() {
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_RUNTIME !== "nodejs"
  ) {
    return;
  }

  const { assertProductionConfig } = await import("./lib/production-config");
  assertProductionConfig();
}
