import { or } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";

const ALLOWED_SORT_FIELDS = [
  "id",
  "name",
  "price",
  "rating",
  "stock",
  "releaseYear",
];

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function applyFilters(queryBuilder, query) {
  let filtered = queryBuilder;

  if (query.search) {
    const search = `%${String(query.search)}%`;
    filtered = filtered.where((p) =>
      or(p.name.ilike(search), p.brand.ilike(search), p.category.ilike(search)),
    );
  }

  if (query.category) filtered = filtered.where({ category: query.category });
  if (query.brand) filtered = filtered.where({ brand: query.brand });

  if (query.brands) {
    const brands = (
      Array.isArray(query.brands)
        ? query.brands
        : String(query.brands).split(",")
    )
      .map((brand) => String(brand).trim())
      .filter(Boolean);
    if (brands.length > 0) filtered = filtered.where((p) => p.brand.in(brands));
  }

  const ranges = [
    ["price", "minPrice", "maxPrice"],
    ["rating", "minRating", "maxRating"],
    ["stock", "minStock", "maxStock"],
    ["releaseYear", "minYear", "maxYear"],
    ["ram", "minRam", null],
    ["storage", "minStorage", null],
  ];

  for (const [field, minimum, maximum] of ranges) {
    const min = query[minimum] === undefined ? null : toNumber(query[minimum]);
    const max =
      maximum && query[maximum] !== undefined ? toNumber(query[maximum]) : null;
    if (min !== null) filtered = filtered.where((p) => p[field].gte(min));
    if (max !== null) filtered = filtered.where((p) => p[field].lte(max));
  }

  if (query.releaseYear !== undefined) {
    const year = toNumber(query.releaseYear);
    if (year !== null) filtered = filtered.where((p) => p.releaseYear.eq(year));
  }

  if (query.featured !== undefined) {
    const featured =
      query.featured === true ||
      String(query.featured).toLowerCase() === "true";
    filtered = filtered.where({ featured });
  }

  if (query.status) filtered = filtered.where({ status: query.status });
  if (query.color)
    filtered = filtered.where((p) => p.color.ilike(String(query.color)));
  if (query.processor)
    filtered = filtered.where((p) =>
      p.processor.ilike(String(query.processor)),
    );

  return filtered;
}

function applySorting(queryBuilder, query) {
  const sortBy = query.sortBy || "id";
  const order = String(query.order || "asc").toLowerCase();

  if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
    return queryBuilder.orderBy((p) => p.id.asc());
  }

  return queryBuilder.orderBy((p) =>
    order === "desc" ? p[sortBy].desc() : p[sortBy].asc(),
  );
}

function getPagination(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

export async function queryProducts(query = {}) {
  const baseQuery = applyFilters(db.orm.public.Product, query);
  const { page, limit, offset } = getPagination(query);
  const sortedQuery = applySorting(baseQuery, query);
  const [data, totalResult] = await Promise.all([
    sortedQuery.offset(offset).limit(limit).all(),
    baseQuery.aggregate((aggregate) => ({ total: aggregate.count() })),
  ]);
  const total = totalResult.total;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function getProductById(id) {
  return db.orm.public.Product.first({ id: String(id) });
}

export async function getMeta() {
  const products = await db.orm.public.Product.select(
    "category",
    "brand",
  ).all();
  return {
    total: products.length,
    categories: [...new Set(products.map((p) => p.category))],
    brands: [...new Set(products.map((p) => p.brand))].sort(),
  };
}
