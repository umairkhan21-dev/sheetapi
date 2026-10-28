import { open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Live tests share the one real Google connection in MariaDB. Node runs test
// files at the same time, so this file lock keeps those tests from creating
// and deleting that account's API rows while another test is comparing them.
const lockPath = join(tmpdir(), "sheetapi-connected-account.lock");
const waitMs = 180_000;
const pollMs = 40;
const freshEmptyMs = 1_000;

export async function withConnectedAccountLock<T>(run: () => Promise<T>) {
  await acquire();

  try {
    return await run();
  } finally {
    await release();
  }
}

async function acquire() {
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, "wx");

      try {
        await handle.writeFile(String(process.pid));
      } finally {
        await handle.close();
      }

      return;
    } catch (error) {
      if (!isConflict(error)) {
        throw error;
      }
    }

    if (!(await ownerIsAlive())) {
      await rm(lockPath, { force: true }).catch(() => undefined);
      continue;
    }

    await delay(pollMs);
  }

  throw new Error("Timed out waiting for the connected-account test lock.");
}

async function ownerIsAlive() {
  const text = await readLock();
  const pid = Number(text);

  if (!Number.isInteger(pid) || pid <= 0) {
    const info = await stat(lockPath).catch(() => null);
    return info != null && Date.now() - info.mtimeMs < freshEmptyMs;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isPermissionError(error);
  }
}

async function release() {
  const text = await readLock();

  if (Number(text) !== process.pid) {
    return;
  }

  await rm(lockPath, { force: true });
}

async function readLock() {
  try {
    const handle = await open(lockPath, "r");

    try {
      return await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

function isConflict(error: unknown) {
  return isCode(error, "EEXIST");
}

function isPermissionError(error: unknown) {
  return isCode(error, "EPERM");
}

function isCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
