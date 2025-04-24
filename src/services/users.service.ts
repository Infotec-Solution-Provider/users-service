import { User } from "@in.pulse-crm/sdk";
import UsersClient from "./instances.service";
import QueryBuilder from "../utils/query-builder";
import knex from "knex";
import { RequestFilters } from "@in.pulse-crm/sdk";

class UsersService {
	private readonly qb: QueryBuilder<User>;

	constructor() {
		this.qb = new QueryBuilder<User>("operadores", "CODIGO");
		this.qb.addDateColumns("DATACAD", "ULTIMO_LOGIN_INI", "ULTIMO_LOGIN_FIM", "EXPIRA_EM");
		this.qb.addLikeColumns("NOME", "LOGIN", "EMAIL", "NIVEL", "ATIVO", "EMAILOPERADOR", "EMAIL_EXIBICAO");
	}

	public async getUsers(
		instance: string,
		{ page = "1", perPage = "50", sortBy = "CODIGO", ...filters }: RequestFilters<User>
	) {
		const countQuery = knex<User>({
			client: "mysql2",
		}).from("operadores");
		const dataQuery = knex<User>({
			client: "mysql2",
		}).from("operadores");

		if (filters.CODIGO) {
			dataQuery.where("CODIGO", String(filters.CODIGO));
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

		const data = await UsersClient.executeQuery<User[]>(
			instance,
			dataQuery.toSQL().sql,
			dataQuery.toSQL().bindings as any[]
		);

		return {
			message: "successfully listed users",
			data,
			page: {
				totalRows: Math.ceil(countResult[0]!.count / +perPage || 1),
				current: +page,
			},
		};
	}

	public async getById(instance: string, id: number) {
		const query = "SELECT * FROM operadores WHERE CODIGO = ?";
		const params = [id];

		return UsersClient.executeQuery<Array<User>>(instance, query, params).then((data: User[]) => data[0]);
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
		const { query, params } = this.qb.createUpdate(id, data);
		await UsersClient.executeQuery(instance, query, params);
	}
}

export default new UsersService();
