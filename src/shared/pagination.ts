// Offset pagination helper for admin list endpoints (e.g. the AI usage table).

export interface PageParams {
    page?: number | string;
    pageSize?: number | string;
}

export interface Paged<T> {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export function resolvePage(params: PageParams, defaultSize = 25, maxSize = 100) {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const pageSize = Math.min(maxSize, Math.max(1, Math.floor(Number(params.pageSize) || defaultSize)));
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
