import type { Theme, ThemeId } from "@pulse-brazil/domain";

/** Themes are shared reference data — small, mostly-read repository. */
export interface IThemeRepository {
  findById(id: ThemeId): Promise<Theme | null>;
  findAll(): Promise<Theme[]>;
  save(theme: Theme): Promise<void>;
}
