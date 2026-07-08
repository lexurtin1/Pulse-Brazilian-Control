import type { IThemeRepository } from "@pulse-brazil/application";
import { asThemeId, Theme, type ThemeCategory, type ThemeId } from "@pulse-brazil/domain";
import type { Pool } from "pg";

interface ThemeRow {
  id: string;
  category: string;
  label: string;
  description: string | null;
}

function rowToTheme(row: ThemeRow): Theme {
  try {
    return Theme.of({
      id: asThemeId(row.id),
      category: row.category as ThemeCategory,
      label: row.label,
      description: row.description ?? undefined,
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct Theme ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies IThemeRepository. No ORM — plain parameterised SQL against the themes table (see migrations/005_create_themes.sql). */
export class PostgresThemeRepository implements IThemeRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: ThemeId): Promise<Theme | null> {
    const { rows } = await this.pool.query<ThemeRow>("SELECT * FROM themes WHERE id = $1", [id]);
    const [row] = rows;
    return row ? rowToTheme(row) : null;
  }

  async findAll(): Promise<Theme[]> {
    const { rows } = await this.pool.query<ThemeRow>("SELECT * FROM themes ORDER BY label");
    return rows.map(rowToTheme);
  }

  async save(theme: Theme): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO themes (id, category, label, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        category = EXCLUDED.category,
        label = EXCLUDED.label,
        description = EXCLUDED.description
      `,
      [theme.id, theme.category, theme.label, theme.description ?? null],
    );
  }
}
