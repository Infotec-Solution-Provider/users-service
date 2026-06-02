import { User } from "@in.pulse-crm/sdk";
import UsersClient from "./instances.service";
import QueryBuilder from "../utils/query-builder";
import knex from "knex";
import { RequestFilters } from "@in.pulse-crm/sdk";
import { GlobalSipConfig, SipConfig } from "../types/sip-config.type";

const GLOBAL_SIP_CONFIG_FIELDS = [
  "ASTERISK_SERVER",
  "ASTERISK_PORTA",
  "ASTERISK_PROXY",
  "SIP_EMITE_BIP",
  "SIP_VOLUME_AUTOMATICO",
  "CALL_IN_DEVICE",
  "CALL_OUT_DEVICE",
  "RING_DEVICE",
  "IP_TELNET",
  "PORTA_TELNET",
  "USUARIO_TELNET",
  "SENHA_TELNET",
  "PAUSARRAMAL",
  "RAMALPAUSA",
  "RAMALDESPAUSA",
  "LIGACAO_IMEDIATA",
  "SIP_ID",
  "SIP_KEY",
  "GRAVAR_LIGACAO",
] as const;

type GlobalSipConfigField = (typeof GLOBAL_SIP_CONFIG_FIELDS)[number];

class UsersService {
  private readonly qb: QueryBuilder<User>;

  constructor() {
    this.qb = new QueryBuilder<User>("operadores", "CODIGO");
    this.qb.addDateColumns(
      "DATACAD",
      "ULTIMO_LOGIN_INI",
      "ULTIMO_LOGIN_FIM",
      "EXPIRA_EM"
    );
    this.qb.addLikeColumns(
      "NOME",
      "LOGIN",
      "EMAIL",
      "NIVEL",
      "ATIVO",
      "EMAILOPERADOR",
      "EMAIL_EXIBICAO"
    );
  }

  private normalizeGlobalSipConfig(
    row?: Partial<Record<GlobalSipConfigField | "CODIGO", unknown>> | null
  ): GlobalSipConfig | null {
    if (!row || typeof row["CODIGO"] !== "number") {
      return null;
    }

    const data = {
      CODIGO: row["CODIGO"],
    } as GlobalSipConfig;

    for (const field of GLOBAL_SIP_CONFIG_FIELDS) {
      const value = row[field];
      data[field] = value == null ? null : String(value);
    }

    return data;
  }

  private buildGlobalSipConfigUpdatePayload(payload: Partial<GlobalSipConfig>) {
    return GLOBAL_SIP_CONFIG_FIELDS.reduce((acc, field) => {
      if (field in payload) {
        const value = payload[field];
        acc[field] = value == null ? null : String(value).trim() || null;
      }

      return acc;
    }, {} as Partial<Record<GlobalSipConfigField, string | null>>);
  }

  public async getUsers(
    instance: string,
    {
      page = "1",
      perPage = "50",
      sortBy = "CODIGO",
      ...filters
    }: RequestFilters<User>
  ) {
    const countQuery = knex<User & { DESATIVAR_EXIBICAO_WHATS?: boolean }>({
      client: "mysql2",
    }).from("operadores");
    const dataQuery = knex<User & { DESATIVAR_EXIBICAO_WHATS?: boolean }>({
      client: "mysql2",
    }).from("operadores");

    dataQuery.where("DESATIVAR_EXIBICAO_WHATS", false);
    countQuery.where("DESATIVAR_EXIBICAO_WHATS", false);

    if (filters.CODIGO) {
      countQuery.where("CODIGO", String(filters.CODIGO));
      dataQuery.where("CODIGO", String(filters.CODIGO));
    }

    if (filters.NOME) {
      countQuery.where("NOME", "like", `%${filters.NOME}%`);
      dataQuery.where("NOME", "like", `%${filters.NOME}%`);
    }

    if (filters.LOGIN) {
      countQuery.whereLike("LOGIN", `%${filters.LOGIN}%`);
      dataQuery.whereLike("LOGIN", `%${filters.LOGIN}%`);
    }

    if (filters.NIVEL) {
      countQuery.where("NIVEL", String(filters.NIVEL));
      dataQuery.where("NIVEL", String(filters.NIVEL));
    }

    if (filters.EMAIL) {
      countQuery.where("EMAIL", "like", `%${filters.EMAIL}%`);
      dataQuery.where("EMAIL", "like", `%${filters.EMAIL}%`);
    }

    if (filters.ATIVO) {
      countQuery.where("ATIVO", String(filters.ATIVO));
      dataQuery.where("ATIVO", String(filters.ATIVO));
    }

    if (filters.DATACAD) {
      countQuery.where("DATACAD", ">=", filters.DATACAD);
      dataQuery.where("DATACAD", ">=", filters.DATACAD);
    }

    if (filters.ULTIMO_LOGIN_INI) {
      countQuery.where("ULTIMO_LOGIN_INI", ">=", filters.ULTIMO_LOGIN_INI);
      dataQuery.where("ULTIMO_LOGIN_INI", ">=", filters.ULTIMO_LOGIN_INI);
    }

    if (filters.ULTIMO_LOGIN_FIM) {
      countQuery.where("ULTIMO_LOGIN_FIM", "<=", filters.ULTIMO_LOGIN_FIM);
      dataQuery.where("ULTIMO_LOGIN_FIM", "<=", filters.ULTIMO_LOGIN_FIM);
    }

    if (filters.EXPIRA_EM) {
      countQuery.where("EXPIRA_EM", "<=", filters.EXPIRA_EM);
      dataQuery.where("EXPIRA_EM", "<=", filters.EXPIRA_EM);
    }

    if (filters.SETOR) {
      countQuery.where("SETOR", Number(filters.SETOR));
      dataQuery.where("SETOR", Number(filters.SETOR));
    }

    countQuery.orderBy(String(sortBy), "asc");
    countQuery.count({ count: "*" });

    const countResult = await UsersClient.executeQuery<{ count: number }[]>(
      instance,
      countQuery.toSQL().sql,
      countQuery.toSQL().bindings as any[]
    );

    dataQuery
      .select("*")
      .limit(+perPage)
      .offset((+page - 1) * +perPage);

    const data = await UsersClient.executeQuery<
      (User & { DESATIVAR_EXIBICAO_WHATS?: boolean })[]
    >(instance, dataQuery.toSQL().sql, dataQuery.toSQL().bindings as any[]);

    const totalRows = countResult[0]?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / +perPage));

    return {
      message: "successfully listed users",
      data,
      page: {
        totalRows,
        totalPages,
        current: +page,
      },
    };
  }

  public async getById(instance: string, id: number) {
    const query = "SELECT * FROM operadores WHERE CODIGO = ?";
    const params = [id];

    return UsersClient.executeQuery<Array<User>>(instance, query, params).then(
      (data: User[]) => data[0]
    );
  }

  public async create(instance: string, data: User) {
    data.CODIGO =
      (await UsersClient.executeQuery<Array<{ id: number }>>(
        instance,
        "SELECT MAX(CODIGO) AS id FROM operadores",
        []
      ).then((data: Array<{ id: number }>) => data[0]?.id || 0)) + 1;

    const { query, params } = this.qb.createInsert(data);
    await UsersClient.executeQuery(instance, query, params);
  }

  public async update(instance: string, id: number, data: Partial<User>) {
    if (!data || Object.keys(data).length === 0) {
      // No data to update, return or throw an error as needed
      return;
    }
    const { query, params } = this.qb.createUpdate(id, data);
    await UsersClient.executeQuery(instance, query, params);
  }

  public async getGlobalSipConfig(instance: string): Promise<GlobalSipConfig | null> {
    const query = knex({ client: "mysql2" })
      .from("parametros")
      .select(["CODIGO", ...GLOBAL_SIP_CONFIG_FIELDS])
      .orderBy("CODIGO", "asc")
      .first()
      .toSQL();

    const data = await UsersClient.executeQuery<
      Array<Partial<Record<GlobalSipConfigField | "CODIGO", unknown>>>
    >(instance, query.sql, query.bindings as unknown[]);

    return this.normalizeGlobalSipConfig(data[0]);
  }

  public async upsertGlobalSipConfig(
    instance: string,
    payload: Partial<GlobalSipConfig>
  ): Promise<GlobalSipConfig> {
    const updateData = this.buildGlobalSipConfigUpdatePayload(payload);
    let current = await this.getGlobalSipConfig(instance);

    if (!current) {
      const insertQuery = knex({ client: "mysql2" })
        .from("parametros")
        .insert(updateData)
        .toSQL();

      await UsersClient.executeQuery(instance, insertQuery.sql, insertQuery.bindings as unknown[]);
      current = await this.getGlobalSipConfig(instance);

      if (!current) {
        throw new Error("failed to create global sip config row");
      }

      return current;
    }

    if (Object.keys(updateData).length > 0) {
      const updateQuery = knex({ client: "mysql2" })
        .from("parametros")
        .update(updateData)
        .where("CODIGO", current.CODIGO)
        .toSQL();

      await UsersClient.executeQuery(instance, updateQuery.sql, updateQuery.bindings as unknown[]);
      current = await this.getGlobalSipConfig(instance);
    }

    if (!current) {
      throw new Error("failed to load global sip config row after update");
    }

    return current;
  }

  public async getSipConfigs(
    instance: string,
    { page = "1", perPage = "20", sortBy = "COD_CONFIG_SIP", ...filters }: RequestFilters<SipConfig>
  ) {
    const countQuery = knex<SipConfig>({ client: "mysql2" }).from("operadores_config_sip");
    const dataQuery = knex<SipConfig>({ client: "mysql2" }).from("operadores_config_sip");

    if (filters.COD_OPERADOR) {
      countQuery.where("COD_OPERADOR", Number(filters.COD_OPERADOR));
      dataQuery.where("COD_OPERADOR", Number(filters.COD_OPERADOR));
    }

    if (filters.RAMAL_SIP) {
      countQuery.whereLike("RAMAL_SIP", `%${filters.RAMAL_SIP}%`);
      dataQuery.whereLike("RAMAL_SIP", `%${filters.RAMAL_SIP}%`);
    }

    if (filters.LOGIN_SIP) {
      countQuery.whereLike("LOGIN_SIP", `%${filters.LOGIN_SIP}%`);
      dataQuery.whereLike("LOGIN_SIP", `%${filters.LOGIN_SIP}%`);
    }

    if (filters.IP_SERVIDOR_SIP) {
      countQuery.whereLike("IP_SERVIDOR_SIP", `%${filters.IP_SERVIDOR_SIP}%`);
      dataQuery.whereLike("IP_SERVIDOR_SIP", `%${filters.IP_SERVIDOR_SIP}%`);
    }

    countQuery.count({ count: "*" });

    const countResult = await UsersClient.executeQuery<Array<{ count: number }>>(
      instance,
      countQuery.toSQL().sql,
      countQuery.toSQL().bindings as unknown[]
    );

    const sortColumn = String(sortBy);
    const data = await UsersClient.executeQuery<SipConfig[]>(
      instance,
      dataQuery
        .select("*")
        .orderBy(sortColumn, "asc")
        .limit(+perPage)
        .offset((+page - 1) * +perPage)
        .toSQL().sql,
      dataQuery
        .select("*")
        .orderBy(sortColumn, "asc")
        .limit(+perPage)
        .offset((+page - 1) * +perPage)
        .toSQL().bindings as unknown[]
    );

    const totalRows = countResult[0]?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / +perPage));

    return {
      message: "successfully listed sip configs",
      data,
      page: {
        totalRows,
        totalPages,
        current: +page,
      },
    };
  }

  public async getSipConfigByOperator(instance: string, operatorId: number): Promise<SipConfig | null> {
    const query = knex<SipConfig>({ client: "mysql2" })
      .from("operadores_config_sip")
      .select("*")
      .where("COD_OPERADOR", operatorId)
      .first()
      .toSQL();

    const data = await UsersClient.executeQuery<SipConfig[]>(
      instance,
      query.sql,
      query.bindings as unknown[]
    );

    return data[0] ?? null;
  }

  public async upsertSipConfigByOperator(
    instance: string,
    operatorId: number,
    payload: Partial<SipConfig>
  ): Promise<SipConfig> {
    const current = await this.getSipConfigByOperator(instance, operatorId);

    const data: Partial<SipConfig> = {
      COD_OPERADOR: operatorId,
      RAMAL_SIP: payload.RAMAL_SIP ?? null,
      IP_SERVIDOR_SIP: payload.IP_SERVIDOR_SIP ?? null,
      LOGIN_SIP: payload.LOGIN_SIP ?? null,
      SENHA_SIP: payload.SENHA_SIP ?? null,
      USRID_SIP: payload.USRID_SIP ?? null,
      CODECS_SIP: payload.CODECS_SIP ?? null,
      CFG_CONFIG_SIP: payload.CFG_CONFIG_SIP ?? null,
    };

    if (!current) {
      const maxIdQuery = knex({ client: "mysql2" })
        .from("operadores_config_sip")
        .max<{ id: number }>("COD_CONFIG_SIP as id")
        .first()
        .toSQL();

      const maxIdResult = await UsersClient.executeQuery<Array<{ id: number }>>(
        instance,
        maxIdQuery.sql,
        maxIdQuery.bindings as unknown[]
      );

      const nextId = (maxIdResult[0]?.id ?? 0) + 1;

      const insertQuery = knex({ client: "mysql2" })
        .from("operadores_config_sip")
        .insert({
          COD_CONFIG_SIP: nextId,
          ...data,
        })
        .toSQL();

      await UsersClient.executeQuery(
        instance,
        insertQuery.sql,
        insertQuery.bindings as unknown[]
      );

      return {
        COD_CONFIG_SIP: nextId,
        COD_OPERADOR: operatorId,
        RAMAL_SIP: data.RAMAL_SIP ?? null,
        IP_SERVIDOR_SIP: data.IP_SERVIDOR_SIP ?? null,
        LOGIN_SIP: data.LOGIN_SIP ?? null,
        SENHA_SIP: data.SENHA_SIP ?? null,
        USRID_SIP: data.USRID_SIP ?? null,
        CODECS_SIP: data.CODECS_SIP ?? null,
        CFG_CONFIG_SIP: data.CFG_CONFIG_SIP ?? null,
      };
    }

    const updateQuery = knex({ client: "mysql2" })
      .from("operadores_config_sip")
      .update(data)
      .where("COD_CONFIG_SIP", current.COD_CONFIG_SIP)
      .toSQL();

    await UsersClient.executeQuery(
      instance,
      updateQuery.sql,
      updateQuery.bindings as unknown[]
    );

    return {
      ...current,
      ...data,
      COD_CONFIG_SIP: current.COD_CONFIG_SIP,
      COD_OPERADOR: operatorId,
    } as SipConfig;
  }
}

export default new UsersService();
