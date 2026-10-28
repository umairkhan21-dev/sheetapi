import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("production Prisma deployment files", () => {
  it("generates the ignored client before the production build", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const schema = read("prisma/schema.prisma");
    const gitignore = read(".gitignore");

    assert.equal(
      pkg.scripts.postinstall,
      "prisma generate --config prisma7.config.ts",
    );
    assert.equal(
      pkg.scripts["db:generate"],
      "prisma generate --config prisma7.config.ts",
    );
    assert.equal(
      pkg.scripts.build,
      "prisma generate --config prisma7.config.ts && next build",
    );
    assert.equal(
      pkg.scripts["db:migrate:deploy"],
      "prisma migrate deploy --config prisma7.config.ts",
    );
    assert.equal(
      Object.values(pkg.scripts).some((script) =>
        /migrate dev|migrate reset|db push/.test(script),
      ),
      false,
    );
    assert.equal(typeof pkg.dependencies.prisma, "string");
    assert.equal(typeof pkg.dependencies["@prisma/client"], "string");
    assert.equal(typeof pkg.dependencies["@prisma/adapter-mariadb"], "string");
    assert.match(schema, /provider\s*=\s*"prisma-client"/);
    assert.match(schema, /output\s*=\s*"\.\.\/app\/generated\/prisma"/);
    assert.match(schema, /provider\s*=\s*"mysql"/);
    assert.match(gitignore, /^\/app\/generated\/prisma$/m);
    assert.match(read("prisma7.config.ts"), /schema:\s*"prisma\/schema\.prisma"/);
    assert.match(
      read("prisma7.config.ts"),
      /path:\s*"prisma\/migrations"/,
    );
    assert.match(read("prisma7.config.ts"), /process\.env\["DATABASE_URL"\]/);
  });

  it("locks Prisma 7.10 and keeps migration history aligned with the schema", () => {
    const lock = JSON.parse(read("package-lock.json")) as {
      lockfileVersion: number;
      packages: Record<string, { version?: string; engines?: { node?: string } }>;
    };
    const pkg = JSON.parse(read("package.json")) as {
      engines: { node: string };
    };
    const schema = read("prisma/schema.prisma");
    const migrationsDir = path.join(root, "prisma", "migrations");
    const entries = readdirSync(migrationsDir, { withFileTypes: true });
    const migrationNames = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const sql = migrationNames
      .map((name) => read(path.join("prisma", "migrations", name, "migration.sql")))
      .join("\n");

    assert.equal(lock.lockfileVersion, 3);
    assert.equal(lock.packages[""]?.engines?.node, pkg.engines.node);
    assert.equal(lock.packages["node_modules/prisma"]?.version, "7.10.0");
    assert.equal(lock.packages["node_modules/@prisma/client"]?.version, "7.10.0");
    assert.equal(
      lock.packages["node_modules/@prisma/adapter-mariadb"]?.version,
      "7.10.0",
    );
    assert.equal(read("prisma/migrations/migration_lock.toml").includes('provider = "mysql"'), true);
    assert.deepEqual(migrationNames, [
      "20261005095944_init",
      "20261006094801_add_google_connection",
      "20261007112203_add_password_reset_token",
      "20261009100521_add_selected_spreadsheet",
      "20261012080933_add_api_configuration",
      "20261012110550_add_api_key",
      "20261020130000_add_rate_limit_bucket",
    ]);

    for (const model of [
      "User",
      "GoogleConnection",
      "PasswordResetToken",
      "SelectedSpreadsheet",
      "Api",
      "ApiKey",
      "RateLimitBucket",
    ]) {
      assert.match(schema, new RegExp(`model ${model} \\{`));
      assert.match(sql, new RegExp(`CREATE TABLE \`${model}\``));
    }

    assert.match(schema, /passwordChangedAt/);
    assert.match(sql, /ADD COLUMN `passwordChangedAt`/);
    assert.match(sql, /ENUM\('ACTIVE', 'DISABLED'\)/);
    assert.equal(sql.includes("DROP TABLE"), false);
  });
});
