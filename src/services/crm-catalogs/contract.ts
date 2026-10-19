export interface CatalogSession { instance: string; userId: number; role: string }
export type Row = Record<string, string | number | null>;
export class CatalogError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly outcome?: "UNKNOWN") { super(message); }
}
export function invalid(message = "Dados inválidos."): never { throw new CatalogError(400, "CRM_CATALOG_INVALID", message); }
export function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.keys(input).some(key => !keys.includes(key))) return invalid();
  return input as Record<string, unknown>;
}
export function admin(session: unknown): asserts session is CatalogSession {
  if (!session || typeof session !== "object") throw new CatalogError(401, "CRM_CATALOG_UNAUTHENTICATED", "Autenticação necessária.");
  const value = session as Partial<CatalogSession>;
  if (typeof value.instance !== "string" || !value.instance.trim() || !Number.isSafeInteger(value.userId) || Number(value.userId) <= 0) throw new CatalogError(401, "CRM_CATALOG_UNAUTHENTICATED", "Sessão inválida.");
  if (value.role !== "ADMIN") throw new CatalogError(403, "CRM_CATALOG_FORBIDDEN", "Acesso restrito a administradores.");
}
export function integer(value: unknown, positive = false): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < (positive ? 1 : -2147483648) || value > 2147483647) return invalid("Código ou número inválido.");
  return value;
}
export function id(value: unknown): number {
  if (typeof value !== "string" || !/^(?:0|-?[1-9]\d*)$/.test(value)) return invalid("Código inválido.");
  return integer(Number(value));
}
interface Field { type: "text" | "flag" | "time" | "duration"; max?: number; default: string | number | null }
export interface CatalogDefinition { table: string; fields: Record<string, Field>; references: { table: string; field: string }[] }
export const catalogs = {
  "user-groups": { table: "grupos_operador", fields: { DESCRICAO: { type: "text", max: 35, default: null } }, references: [{ table: "gruposxoperadores", field: "GRUPO" }] },
  shifts: { table: "horarios", fields: Object.fromEntries([
    ["DESCRICAO", { type: "text", max: 50, default: "" }],
    ...[1, 2, 3].flatMap(index => [[`HORARIO_${index}`, { type: "flag", default: null }], [`ENTRADA_${index}`, { type: "time", default: "00:00:00" }], [`SAIDA_${index}`, { type: "time", default: "00:00:00" }]]),
  ]) as Record<string, Field>, references: [{ table: "operadores", field: "HORARIO" }] },
  "pause-reasons": { table: "motivos_pausa", fields: { DESCRICAO: { type: "text", max: 50, default: null }, TEMPO_MAX_SEG: { type: "duration", default: 0 }, PRODUTIVIDADE: { type: "flag", default: "SIM" } }, references: [{ table: "pausas_realizadas", field: "COD_PAUSA" }] },
} satisfies Record<string, CatalogDefinition>;
export type CatalogName = keyof typeof catalogs;
export function definition(name: string): CatalogDefinition {
  if (!Object.hasOwn(catalogs, name)) throw new CatalogError(404, "CRM_CATALOG_NOT_FOUND", "Cadastro não encontrado.");
  return catalogs[name as CatalogName];
}
function field(value: unknown, spec: Field, historical = false): string | number | null {
  if (value === null) return null;
  if (spec.type === "duration") {
    const result = integer(value);
    if (!historical && result < 0) return invalid("O tempo máximo deve ser zero ou positivo.");
    return result;
  }
  if (typeof value !== "string") return invalid();
  if (spec.type === "flag") {
    if (!["SIM", "NAO"].includes(value)) return invalid("Opção inválida.");
    return value;
  }
  if (spec.type === "time") {
    if (!(historical ? /^-?(?:\d{2}|[1-7]\d{2}|8[0-2]\d|83[0-8]):[0-5]\d:[0-5]\d$/ : /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/).test(value)) return invalid("Horário inválido. Use HH:mm:ss.");
    return value;
  }
  const result = historical ? value : value.trim();
  if ([...result].length > (spec.max ?? 0) || (!historical && (!result || /[^\u0020-\u007e\u00a0-\u00ff]/.test(result)))) return invalid(`Descrição inválida (máximo ${spec.max} caracteres Latin1).`);
  return result;
}
export function snapshot(input: unknown, spec: CatalogDefinition): Row {
  const data = object(input, Object.keys(spec.fields)), result: Row = {};
  for (const [key, value] of Object.entries(spec.fields)) {
    if (!Object.hasOwn(data, key)) return invalid("Recarregue o registro antes de continuar.");
    result[key] = field(data[key], value, true);
  }
  return result;
}
export function create(input: unknown, spec: CatalogDefinition): Row {
  const data = object(input, ["CODIGO", ...Object.keys(spec.fields)]);
  const result: Row = { CODIGO: integer(data["CODIGO"], true) };
  if (typeof data["DESCRICAO"] !== "string") return invalid("Informe a descrição.");
  for (const [key, value] of Object.entries(spec.fields)) result[key] = Object.hasOwn(data, key) ? field(data[key], value) : value.default;
  return result;
}
export function patch(input: unknown, spec: CatalogDefinition): { changes: Row; expected: Row } {
  const data = object(input, ["changes", "expected"]), changes = object(data["changes"], Object.keys(spec.fields));
  if (!Object.keys(changes).length) return invalid("Informe ao menos uma alteração.");
  return { changes: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, field(value, spec.fields[key]!)])), expected: snapshot(data["expected"], spec) };
}
