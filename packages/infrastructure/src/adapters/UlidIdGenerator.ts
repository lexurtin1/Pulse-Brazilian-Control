import type { IIdGenerator } from "@pulse-brazil/application";
import { ulid } from "ulid";

/** Generates lexicographically sortable, timestamp-prefixed ids — a reasonable default for a Postgres-first system where insertion order often matters for debugging. */
export class UlidIdGenerator implements IIdGenerator {
  newId(): string {
    return ulid();
  }
}
