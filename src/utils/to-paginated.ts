function toPaginated(data: Array<any>, page: number, perPage: number) {
    return {
        data: data.slice((page - 1) * perPage, page * perPage),
        page: {
            current: page,
            next: data.length > perPage
        }
    };
}

export default toPaginated;