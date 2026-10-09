import fs from "node:fs";
import path from "node:path";

export interface E2EAccount {
  username: string;
  password: string;
}

export function readE2EAccount(): E2EAccount {
  const file = path.resolve(import.meta.dirname, "../../backend/.test-runtime/account.json");
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!isAccount(parsed)) {
    throw new Error("The disposable test account file is incomplete.");
  }
  return parsed;
}

function isAccount(value: unknown): value is E2EAccount {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.username === "string" && record.username.length > 0
    && typeof record.password === "string" && record.password.length > 0;
}
