import { db } from "./db.ts";
import products from "../data/products.js";

if (products.length !== 100) {
  throw new Error(`Expected 100 products, found ${products.length}`);
}

for (const product of products) {
  await db.orm.public.Product.upsert({
    create: {
      ...product,
      id: String(product.id),
    },
    update: {
      name: product.name,
      category: product.category,
      brand: product.brand,
      price: product.price,
      rating: product.rating,
      stock: product.stock,
      status: product.status,
      featured: product.featured,
      releaseYear: product.releaseYear,
      color: product.color,
      ram: product.ram,
      storage: product.storage,
      processor: product.processor,
    },
  });
}

console.log(`Seeded ${products.length} products.`);
await db.close();
