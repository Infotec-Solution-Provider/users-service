class QueryBuilder<T> {
    private readonly dateColumns: Array<keyof T> = [];
    private readonly likeColumns: Array<keyof T> = [];
    private readonly table: string;
    private readonly pk: keyof T;


    constructor(table: string, pk: keyof T) {
        this.table = table;
        this.pk = pk;
    }

    public addLikeColumns(...likeColumns: Array<keyof T>) {
        this.likeColumns.push(...likeColumns);
    }

    public addDateColumns(...dateColumns: Array<keyof T>) {
        this.dateColumns.push(...dateColumns);
    }

    public createSelect(columns: Array<keyof T> | "*", filters: Partial<Record<keyof T, string>>, offset: number = 0, limit: number = 50) {
        const selectClause = this.createSelectClause(this.table, columns);
        const { whereClause, whereParams } = this.createWhereClause(filters);
        const limitClause = this.createLimitClause(limit, offset);

        return {
            query: `${selectClause} ${whereClause} ${limitClause}`,
            params: whereParams
        };
    }

    public createInsert(data: Partial<T>) {
        const columns = Object.keys(data);
        const values = Object.values(data);

        const insertQuery = `INSERT INTO ${this.table} (${columns.map(_ => "?").join(", ")})`;

        return {
            query: insertQuery,
            params: values
        };
    }

    public createUpdate(pk: string | number, data: Partial<T>) {
        const columns = Object.keys(data);
        const values = Object.values(data);

        const updateQuery = `UPDATE ${this.table} SET ${columns.map(c => `${c} = ?`).join(", ")} WHERE ${String(this.pk)} = ?`;

        return {
            query: updateQuery,
            params: [...values, pk]
        };
    }

    private createSelectClause(table: string, fields: Array<keyof T> | "*") {
        const fieldsString = fields === "*" ? "*" : fields.join(", ");

        return `SELECT ${fieldsString} FROM ${table}`;
    }

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

    private createLimitClause(limit?: number, offset?: number) {
        return limit ? `LIMIT ${limit + 1} OFFSET ${offset || 0}` : "";
    }
}

export default QueryBuilder;