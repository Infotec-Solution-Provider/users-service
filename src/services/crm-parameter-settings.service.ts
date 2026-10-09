import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@rgranatodutra/http-errors";
import instancesService from "./instances.service";
import {
  crmParameterSettings,
  CrmParameterSetting,
} from "../parameters/crm-parameter-settings.catalog";

interface Column {
  name: string;
  defaultValue: string | number | null;
  nullable: string;
  dataType: string;
  columnType: string;
}
interface Change {
  key: string;
  value: string | null;
  previousValue: string | null;
}
type Row = Record<string, unknown>;
const normalize = (value: unknown) => (value == null ? null : String(value));

class CrmParameterSettingsService {
  private async columns(instance: string) {
    return instancesService.executeQuery<Column[]>(
      instance,
      "SELECT COLUMN_NAME AS name, COLUMN_DEFAULT AS defaultValue, IS_NULLABLE AS nullable, DATA_TYPE AS dataType, COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      ["parametros"],
    );
  }

  private supported(columns: Column[]): CrmParameterSetting[] {
    return crmParameterSettings.filter((setting) => {
      const column = columns.find((entry) => entry.name === setting.key);
      if (!column) return false;
      if (setting.type === "number")
        return ["int", "smallint", "mediumint", "bigint"].includes(
          column.dataType,
        );
      if (column.dataType === "enum") {
        return (
          column.columnType.includes(`'${setting.trueValue}'`) &&
          column.columnType.includes(`'${setting.falseValue}'`)
        );
      }
      return ["char", "varchar"].includes(column.dataType);
    });
  }

  private async row(instance: string, settings: CrmParameterSetting[]) {
    const fields = ["CODIGO", ...settings.map((setting) => setting.key)]
      .map((key) => `\`${key}\``)
      .join(", ");
    const rows = await instancesService.executeQuery<Row[]>(
      instance,
      `SELECT ${fields} FROM parametros ORDER BY CODIGO ASC LIMIT 1`,
      [],
    );
    if (!rows[0])
      throw new NotFoundError(
        "O CRM ainda não possui um registro de parâmetros. Configure-o no CRM legado antes de editar.",
      );
    return rows[0];
  }

  private snapshot(
    settings: CrmParameterSetting[],
    columns: Column[],
    row: Row,
  ) {
    return {
      catalog: settings.map((setting) => {
        const column = columns.find((entry) => entry.name === setting.key)!;
        return {
          ...setting,
          defaultValue: normalize(column.defaultValue),
          canReset: column.defaultValue !== null || column.nullable === "YES",
        };
      }),
      values: Object.fromEntries(
        settings.map((setting) => [setting.key, normalize(row[setting.key])]),
      ),
    };
  }

  public async get(instance: string) {
    const columns = await this.columns(instance);
    if (!columns.some((column) => column.name === "CODIGO"))
      throw new NotFoundError("Tabela de parâmetros do CRM indisponível.");
    const settings = this.supported(columns);
    return this.snapshot(settings, columns, await this.row(instance, settings));
  }

  public async save(instance: string, body: unknown) {
    const raw = (body as { changes?: unknown } | null)?.changes;
    if (
      !Array.isArray(raw) ||
      !raw.length ||
      raw.length > crmParameterSettings.length
    )
      throw new BadRequestError("Informe as configurações alteradas.");
    const columns = await this.columns(instance);
    const settings = this.supported(columns);
    const seen = new Set<string>();
    const changes = raw.map((item: unknown): Change => {
      const change = item as Change | null;
      const setting = settings.find((entry) => entry.key === change?.key);
      if (!setting || !change || seen.has(change.key))
        throw new BadRequestError(
          "Configuração desconhecida, indisponível ou repetida.",
        );
      seen.add(change.key);
      const column = columns.find((entry) => entry.name === setting.key)!;
      if (
        change.previousValue !== null &&
        (typeof change.previousValue !== "string" ||
          change.previousValue.length > 1000)
      )
        throw new BadRequestError("Valor anterior inválido.");
      if (change.value === null) {
        if (column.defaultValue === null && column.nullable !== "YES")
          throw new BadRequestError(`${setting.label}: informe um valor.`);
      } else if (setting.type === "boolean") {
        if (
          change.value !== setting.trueValue &&
          change.value !== setting.falseValue
        )
          throw new BadRequestError(
            `${setting.label}: escolha ativado ou desativado.`,
          );
      } else {
        const value = Number(change.value);
        if (
          typeof change.value !== "string" ||
          !/^\d+$/.test(change.value) ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > (setting.max ?? 2147483647)
        ) {
          throw new BadRequestError(
            `${setting.label}: informe um número inteiro válido.`,
          );
        }
      }
      return {
        key: change.key,
        value: change.value,
        previousValue: change.previousValue,
      };
    });
    const current = await this.row(instance, settings);
    if (
      changes.some(
        (change) => normalize(current[change.key]) !== change.previousValue,
      )
    )
      throw new ConflictError(
        "As configurações foram alteradas por outra pessoa. Recarregue antes de salvar.",
      );
    // One atomic UPDATE, with comparison in SQL to protect against concurrent edits after the read.
    // Identifiers come exclusively from the supported catalog. All user values are bound parameters.
    const assignments = changes
      .map(
        (change) =>
          `\`${change.key}\` = ${change.value === null ? "DEFAULT" : "?"}`,
      )
      .join(", ");
    const predicates = changes
      .map((change) => `\`${change.key}\` <=> ?`)
      .join(" AND ");
    const result = await instancesService.executeQuery<{
      affectedRows: number;
    }>(
      instance,
      `UPDATE parametros SET ${assignments} WHERE CODIGO = ? AND ${predicates}`,
      [
        ...changes
          .filter((change) => change.value !== null)
          .map((change) => change.value),
        current["CODIGO"],
        ...changes.map((change) => change.previousValue),
      ],
    );
    if (result.affectedRows === 0)
      throw new ConflictError(
        "Nenhuma alteração confirmada. Recarregue as configurações antes de salvar.",
      );
    return this.snapshot(settings, columns, await this.row(instance, settings));
  }
}

export default new CrmParameterSettingsService();
