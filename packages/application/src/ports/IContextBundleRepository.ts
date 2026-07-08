import type { ContextBundle, ContextBundleId } from "@pulse-brazil/domain";

export interface IContextBundleRepository {
  findById(id: ContextBundleId): Promise<ContextBundle | null>;
  save(bundle: ContextBundle): Promise<void>;
}
