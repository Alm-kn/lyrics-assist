import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

const directoryPrefix = "lyrics-assist-e2e-";
const databaseName = "lyrics-assist-e2e.db";
const directory = mkdtempSync(join(tmpdir(), directoryPrefix));
const databasePath = join(directory, databaseName);

function assertSafeCleanupTarget() {
  const resolvedDatabase = resolve(databasePath);
  const resolvedDirectory = dirname(resolvedDatabase);
  const relativeToTemp = relative(resolve(tmpdir()), resolvedDirectory);

  if (
    basename(resolvedDatabase) !== databaseName ||
    !basename(resolvedDirectory).startsWith(directoryPrefix) ||
    relativeToTemp.startsWith("..") ||
    relativeToTemp === "" ||
    resolvedDirectory === resolve(process.cwd(), "data")
  ) {
    throw new Error("Refusing to clean an unsafe E2E database path");
  }
  return resolvedDirectory;
}

const environment = {
  ...process.env,
  LYRICS_ASSIST_DB_PATH: databasePath,
  LYRICS_ASSIST_BETA_USER_ID: randomUUID(),
};
let exitCode = 1;

try {
  const migration =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
          ["/d", "/s", "/c", "npm.cmd run db:migrate"],
          { env: environment, stdio: "inherit" },
        )
      : spawnSync("npm", ["run", "db:migrate"], {
          env: environment,
          stdio: "inherit",
        });
  if (migration.error !== undefined) throw migration.error;

  if (migration.status !== 0) {
    exitCode = migration.status ?? 1;
  } else {
    const playwright = spawnSync(
      process.execPath,
      [
        resolve("node_modules", "@playwright", "test", "cli.js"),
        "test",
        ...process.argv.slice(2),
      ],
      { env: environment, stdio: "inherit" },
    );
    if (playwright.error !== undefined) throw playwright.error;
    exitCode = playwright.status ?? 1;
  }
} finally {
  const cleanupTarget = assertSafeCleanupTarget();
  if (existsSync(cleanupTarget)) {
    rmSync(cleanupTarget, { recursive: true, force: true });
  }
}

process.exitCode = exitCode;
