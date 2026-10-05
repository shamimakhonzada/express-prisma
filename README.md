# Nexura Product API

## Setup

```bash
npm install
npm start
```

The API runs at `http://localhost:3000` by default.

Set a reusable base URL in your API client:

```text
base_url = http://localhost:3000
```

## Product Filtering

The same filters can be sent as query parameters with `GET`, or as a JSON body with `POST` and `QUERY`.

### 1. GET products with query parameters

```http
GET {{base_url}}/products?category=phone&brand=Apple&maxPrice=1200
```

Example with pagination and sorting:

```http
GET {{base_url}}/products?category=laptop&minPrice=500&maxPrice=2000&page=1&limit=10&sortBy=price&order=asc
```

### 2. POST product search

```http
POST {{base_url}}/products/search
Content-Type: application/json

{
  "category": "laptop",
  "brand": "Dell",
  "maxPrice": 2000
}
```

### 3. QUERY products

```http
QUERY {{base_url}}/products
Content-Type: application/json

{
  "category": "laptop",
  "brand": "Dell",
  "maxPrice": 2000
}
```

## More Filter Examples

### Search by name, rating, and stock

```http
GET {{base_url}}/products?search=MacBook&minRating=4.5&minStock=10
```

### Filter featured products in a price range

```http
GET {{base_url}}/products?featured=true&minPrice=1000&maxPrice=2500
```

### Filter by RAM, storage, and processor

```http
POST {{base_url}}/products/search
Content-Type: application/json

{
  "category": "laptop",
  "minRam": 16,
  "minStorage": 512,
  "processor": "Intel i7"
}
```

### Filter by release year and status

```http
QUERY {{base_url}}/products
Content-Type: application/json

{
  "minYear": 2024,
  "maxYear": 2025,
  "status": "active"
}
```

### Filter multiple brands

```http
GET {{base_url}}/products?brands=Apple,Dell,Lenovo
```

### Filter by color and sort by price

```http
GET {{base_url}}/products?color=Silver&sortBy=price&order=desc
```

### Combine filters with pagination

```http
POST {{base_url}}/products/search
Content-Type: application/json

{
  "category": "laptop",
  "minPrice": 800,
  "maxPrice": 2000,
  "minRating": 4.5,
  "page": 1,
  "limit": 5,
  "sortBy": "rating",
  "order": "desc"
}
```

## Supported Filters

| Parameter                 | Example         | Description                                                |
| ------------------------- | --------------- | ---------------------------------------------------------- |
| `search`                  | `phone`         | Searches product name, brand, and category                 |
| `category`                | `laptop`        | Matches a category                                         |
| `brand`                   | `Dell`          | Matches one brand                                          |
| `brands`                  | `Apple,Dell`    | Matches multiple brands                                    |
| `minPrice` / `maxPrice`   | `500` / `2000`  | Filters by price range                                     |
| `minRating` / `maxRating` | `4` / `5`       | Filters by rating range                                    |
| `minStock` / `maxStock`   | `1` / `100`     | Filters by stock range                                     |
| `featured`                | `true`          | Filters featured products                                  |
| `status`                  | `active`        | Matches product status                                     |
| `releaseYear`             | `2024`          | Matches an exact release year                              |
| `minYear` / `maxYear`     | `2022` / `2025` | Filters by release year range                              |
| `minRam`                  | `8`             | Minimum RAM                                                |
| `minStorage`              | `256`           | Minimum storage                                            |
| `color`                   | `black`         | Matches product color                                      |
| `processor`               | `Intel Core i7` | Matches processor                                          |
| `page`                    | `1`             | Page number, minimum `1`                                   |
| `limit`                   | `10`            | Results per page, from `1` to `100`                        |
| `sortBy`                  | `price`         | `id`, `name`, `price`, `rating`, `stock`, or `releaseYear` |
| `order`                   | `desc`          | `asc` or `desc`                                            |

## Response Format

Successful responses use this structure:

```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "method": "GET",
  "data": {
    "data": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0,
      "totalPages": 0,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

Failed responses use the same envelope with `success: false` and `data: null`.

## Other Endpoints

```http
GET {{base_url}}/
GET {{base_url}}/products/:id
GET {{base_url}}/products/meta
```
