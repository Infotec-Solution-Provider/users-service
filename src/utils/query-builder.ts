/**
 * Um query builder SQL genérico para construir queries SELECT, INSERT e UPDATE, com suporte para filtragem, paginação e seleção dinâmica de colunas.
 *
 * @remarks
 * Esta classe fornece métodos para:
 * - Adicionar colunas para filtragem "LIKE" e baseada em datas.
 * - Construir dinamicamente queries SQL para operações SELECT, INSERT e UPDATE.
 * - Lidar com filtragem com suporte para intervalos, wildcards e arrays.
 * - Gerar queries parametrizadas para prevenir SQL injection.
 *
 * @example
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   createdAt: string;
 * }
 *
 * const queryBuilder = new QueryBuilder<User>('users', 'id');
 * queryBuilder.addLikeColumns('name', 'email');
 * queryBuilder.addDateColumns('createdAt');
 *
 * const selectQuery = queryBuilder.createSelect(['id', 'name'], { name: 'John' }, 0, 10);
 * console.log(selectQuery.query); // SELECT id, name FROM users WHERE name LIKE ? LIMIT 11 OFFSET 0
 * console.log(selectQuery.params); // ['%John%']
 *
 * const insertQuery = queryBuilder.createInsert({ name: 'John', email: 'john@example.com' });
 * console.log(insertQuery.query); // INSERT INTO users (?, ?)
 * console.log(insertQuery.params); // ['John', 'john@example.com']
 *
 * const updateQuery = queryBuilder.createUpdate(1, { name: 'John Doe' });
 * console.log(updateQuery.query); // UPDATE users SET name = ? WHERE id = ?
 * console.log(updateQuery.params); // ['John Doe', 1]
 * ```
 */
class QueryBuilder<T> {
    private readonly dateColumns: Array<keyof T> = [];
    private readonly likeColumns: Array<keyof T> = [];
    private readonly table: string;
    private readonly pk: keyof T;


    constructor(table: string, pk: keyof T) {
        this.table = table;
        this.pk = pk;
    }

    /**
     * Adiciona os nomes de uma ou mais colunas à lista de colunas que devem ser usadas para queries "LIKE" no query builder.
     *
     * @param likeColumns - O nome de uma ou mais colunas (que são chaves de tipo genérico "T") a serem adicionados na lista de colunas "LIKE".
     */
    public addLikeColumns(...likeColumns: Array<keyof T>) {
        this.likeColumns.push(...likeColumns);
    }

    /**
     * Adiciona os valores de uma ou mais colunas à lista de colunas de data
     * 
     * @param dateColumns - Uma lista de uma ou mais datas (que são chaves de tipo genérico "T") a serem adicionadas na lista de colunas de data.
     */
    public addDateColumns(...dateColumns: Array<keyof T>) {
        this.dateColumns.push(...dateColumns);
    }

    /**
     * Constrói uma query SQL SELECT com filtragem, paginação e seleção de colunas.
     *
     * @param columns - Um array de nomes de colunas específicas ou "*" para selecionar todas as colunas.
     * @param filters - Um objeto contendo pares de chave-valor para filtrar registros, aonde a chave é o nome da coluna e o valor são critérios para a filtragem.
     * @param offset - O número de registros para pular antes de começar a retornar os registros. Valor padrão é 0.
     * @param limit - O número maximo de registros a serem retornados. Valor padrão é 50.
     * @returns Um objeto contendo uma string SQL e os valores dos filtros para serem usados na execução da query.
     */
    public createSelect(columns: Array<keyof T> | "*", filters: Partial<Record<keyof T, string>>, offset: number = 0, limit: number = 50) {
        const selectClause = this.createSelectClause(this.table, columns);
        const { whereClause, whereParams } = this.createWhereClause(filters);
        const limitClause = this.createLimitClause(limit, offset);

        return {
            query: `${selectClause} ${whereClause} ${limitClause}`,
            params: whereParams
        };
    }

    /**
     * Constrói uma query SQL INSERT e seus valores de parâmetro correspondentes
     * com base no objeto de dados fornecido
     *
     * @param data - Um objeto parcial de tipo genérico "T" contendo os pares de coluna-valor a serem inseridos na tabela do banco de dados.
     * @returns Um objeto contendo:
     *          - `query`: A query SQL INSERT com placeholders como valores.
     *          - `params`: Um array de valores correspondendo aos placeholders na query.
     */
    public createInsert(data: Partial<T>) {
        const columns = Object.keys(data);
        const values = Object.values(data);

        const insertQuery = `INSERT INTO ${this.table} (${columns.map(_ => "?").join(", ")})`;

        return {
            query: insertQuery,
            params: values
        };
    }

    /**
     * Gera a string de uma query SQL UPDATE e seus parâmetros correspondentes para atualizar um registro no banco de dados
     *
     * @param pk - O valor da chave primária do registro a ser atualizado. Pode ser uma string ou um número.
     * @param data - Um objeto parcial contendo as colunas e seus novos valores a serem atualizados.
     * @returns Um objeto contendo:
     *   - `query`: A string contendo a query SQL UPDATE.
     *   - `params`: Um array de parâmetros a serem usados com a query, incluindo os novos valores e o valor da chave primária.
     */
    public createUpdate(pk: string | number, data: Partial<T>) {
        const columns = Object.keys(data);
        const values = Object.values(data);

        const updateQuery = `UPDATE ${this.table} SET ${columns.map(c => `${c} = ?`).join(", ")} WHERE ${String(this.pk)} = ?`;

        return {
            query: updateQuery,
            params: [...values, pk]
        };
    }

    /**
     * Constrói uma cláusula SQL SELECT para a tabela e campos especificados.
     *
     * @param table - O nome da tabela da qual serão selecionados os dados.
     * @param fields - Um array com nomes de campos (chaves de tipo genérico "T") a serem incluídos na cláusula SELECT, ou "*" para selecionar todos os campos.
     * @returns Uma string representando a cláusula SQL SELECT.
     */
    private createSelectClause(table: string, fields: Array<keyof T> | "*") {
        const fieldsString = fields === "*" ? "*" : fields.join(", ");

        return `SELECT ${fieldsString} FROM ${table}`;
    }

    /**
     * Constrói uma cláusula SQL WHERE e seus parâmetros correspondentes baseado nos filtros providenciados.
     * 
     * @param filters - Pares de chave-valor aonde a chave corresponde ao nome da coluna e o valor é a condição de filtro. O valor pode ser uma string, um array, ou um intervalo de datas no formato "start_end".
     * 
     * @returns Um objeto contendo:
     *          - `whereClause`: Uma cláusula SQL WHERE em formato de string.
     *          - `whereParams`: Um array de parâmetros para serem usados na query.
     * 
     * @remarks
     * - Para colunas de data, o valor de filtro deve ser uma string no formato "start_end". O método irá gerar condições para as datas de início e/ou fim se fornecidas.
     * - Para colunas que requerem uma condição "LIKE", o método vai gerar uma condição com wildcard para a pesquisa.
     * - Para arrays de valores, o método vai gerar uma cláusula IN.
     * - Para outros casos, o método vai gerar uma condição de igualdade.
     * - Se não forem fornecidos filtros, será retornado uma cláusula WHERE e uma lista de parâmetros vazia.
     */
    private createWhereClause(filters: Partial<Record<keyof T, string>>) {
        const queryFilters: Array<string> = [];
        const queryParams: Array<any> = [];

        Object.entries(filters).forEach(([key, value]) => {
            if (this.dateColumns.includes(key as keyof T)) {
                const [start, end] = (value as string).split("_");

                if (start) {
                    queryFilters.push(`AND ${key} >= '${start}'`);
                    queryParams.push(new Date(value as string));
                }
                if (end) {
                    queryFilters.push(`AND ${key} <= '${end}'`);
                    queryParams.push(new Date(value as string));
                }
            }
            else if (this.likeColumns.includes(key as keyof T)) {
                queryFilters.push(`AND ${key} LIKE ?`);
                queryParams.push(`%${value}%`);
            }
            else if (Array.isArray(value)) {
                queryFilters.push(`AND ${key} IN (${value.map(_ => "?").join(", ")})`);
                queryParams.push(...value);
            }
            else {
                queryFilters.push(`AND ${key} = ?`);
                queryParams.push(value);
            }
        });

        if (queryFilters.length === 0) {
            return { whereClause: "", whereParams: [] };
        }

        const whereClause = `WHERE ${queryFilters.join(" AND ")}`

        return { whereClause, whereParams: queryParams };
    }

    /**
     * Constrói uma cláusula SQL LIMIT com um OFFSET opcional.
     *
     * @param limit - O número máximo de registros a serem retornados. Se não for providenciado, nenhuma cláusula LIMIT é gerada.
     * @param offset - O número de registros para pular antes de começar a retornar registros. Se não especificado, o valor padrão é 0.
     * @returns Uma cláusula SQL LIMIT em formato de string. Retorna uma string vazia se "limit" não for fornecido.
     */
    private createLimitClause(limit?: number, offset?: number) {
        return limit ? `LIMIT ${limit + 1} OFFSET ${offset || 0}` : "";
    }
}

export default QueryBuilder;