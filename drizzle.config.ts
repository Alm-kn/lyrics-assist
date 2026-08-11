import { defineConfig } from "drizzle-kit";

const databasePath =
  process.env.LYRICS_ASSIST_DB_PATH ?? "data/lyrics-assist.db";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infrastructure/persistence/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databasePath,
  },
});
