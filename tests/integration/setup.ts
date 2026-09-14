import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Integration tests need DATABASE_URL (copy .env.example to .env and start the db).",
  );
}
