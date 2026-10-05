# Stage 7 — Databases & SQL Fundamentals

**Prereqs:** Stages 1–6 (Node.js runtime, core modules, async, ES modules, HTTP, Express).
**Outcome:** she can write and reason about SQL directly, without an ORM in the way.

---

## Why This Stage Comes Before Prisma

Right now she can only talk to the database through an abstraction. That is fine for
building features and useless for the moment anything goes wrong:

- A migration fails and the only explanation is an error code.
- A query is slow and nobody knows why.
- She needs `GROUP BY` and `product.service.js:112` (`getMeta`) is doing it in JavaScript.
- Prisma hands her a fluent builder, but **fluent builders hide the query**. A senior
  engineer reads SQL, not chain calls.

Rule for this stage: **write it in SQL first, then ask "how would Prisma express this?"**
That comparison _is_ the learning.

---

## Session Setup

Postgres is already running locally with the schema applied. She just needs `psql`.

```bash
psql "$(grep DATABASE_URL .env | cut -d= -f2- | tr -d '\"')"
```

If that is awkward, export it once per shell:

```bash
export $(node -e "const p=new URL(process.argv[1].match(/DATABASE_URL=\"?([^\"\n]+)/)[1]);console.log('PGPASSWORD='+decodeURIComponent(p.password));console.log('PGUSER='+p.username);console.log('PGHOST='+p.hostname);console.log('PGDATABASE='+p.pathname.slice(1))" "$(cat .env)")
psql
```

Useful psql meta-commands (these are not SQL — they start with `\`):

| Command       | Purpose                                                          |
| ------------- | ---------------------------------------------------------------- |
| `\d products` | show table structure                                             |
| `\dt`         | list tables                                                      |
| `\q`          | quit                                                             |
| `\x`          | toggle expanded (vertical) row display — **great for wide rows** |
| `\timing`     | show query duration                                              |

**The 1000ms rule.** When she writes a query, she must predict the row count _before_
running it. Then run it. If the guess is off by more than 10x, she did not understand the
query. Write the prediction down.

> Note: this DB prints a `collation version mismatch` **warning** on connect. That is a
> harmless local-environment artifact, not an error. She should learn to read the
> difference between a `WARNING` and an `ERROR` in psql output.

---

## 1. What a Database Actually Is

**The point of a database is durability plus concurrency.** Your Node process has RAM;
RAM dies when the process dies. The database is the only place where "the truth" lives
across restarts and across many simultaneous users.

Mental model:

```
HTTP request
    ↓
Express route            ← stateless, disposable
    ↓
Service (JS)             ← logic, disposable
    ↓
Postgres                 ← durable, shared, concurrent
```

Two consequences she should internalize now:

1. **A database is shared mutable state.** Every design problem in this stage is about
   protecting shared mutable state from concurrent, untrusted callers.
2. **A DBMS is a _server_.** `psql` is just a client. Node+Prisma is also just a client.
   They have equal authority. This is why you can `DELETE FROM products` from a terminal
   and break the running API.

She has `DB` in Prisma and `postgres` in the URL string. That is the _host_. The server
is listening on `localhost:5432` and is reachable by anything that knows the password.

---

## 2. The Relational Model — Using Her Real Schema

```sql
\d products
```

```
                     Column     |       Type       | Nullable | Default
----------------------+---------------+----------+---------
 brand                 | text          | not null |
 category              | text          | not null |
 color                 | text          |          |   ← nullable
 featured              | boolean       | not null |
 id                    | text          | not null |   ← PRIMARY KEY
 name                  | text          | not null |
 price                 | double precision | not null |
 processor             | text          |          |   ← nullable
 ram                   | integer       |          |   ← nullable
 rating                | double precision | not null |
 release_year          | integer       | not null |
 status                | text          | not null |
 stock                 | integer       | not null |
 storage               | integer       |          |   ← nullable
Indexes:
 "products_pkey" PRIMARY KEY, btree (id)
 "products_brand_idx_13825d71"      btree (brand)
 "products_category_idx_f2600f8e"   btree (category)
 "products_price_idx_696ad5eb"      btree (price)
 "products_rating_idx_fcb0b199"     btree (rating)
 "products_release_year_idx_fb38b8a4" btree (release_year)
```

Vocabulary, precisely:

| Term                                | Meaning                                             | In `products`        |
| ----------------------------------- | --------------------------------------------------- | -------------------- |
| **table / relation**                | a set of rows of the same shape                     | `products`           |
| **row / tuple / record**            | one observation                                     | one iPhone           |
| **column / attribute / field**      | one property                                        | `price`              |
| **schema**                          | the _definition_ — types, constraints               | `products` structure |
| **primary key**                     | uniquely identifies a row, never null, never reused | `id`                 |
| **foreign key**                     | a column referencing another table's PK             | _none yet_           |
| **row** vs **record** vs **entity** | same thing, different communities                   |                      |

**Primary keys are non-negotiable.** Without one, `UPDATE ... WHERE id = 'x'` could hit
5 rows. The PK is what makes "this exact row" addressable. Note `id` is `text` holding a
UUID, not a serial integer — see `contract.prisma` `@default(uuid())`.

**Why is `users` empty (0 rows) while `products` has 100?** Because `products` was seeded
and nothing has ever created a user. An empty table is not a bug. Ask her to prove it:

```sql
SELECT count(*) FROM users;
```

> **The `double precision` problem.** `price` is a float. Floats cannot represent `0.1`
> exactly. Ask her why a shopping cart must never store money in a float, then show:
>
> ```sql
> SELECT 0.1::float8 + 0.2::float8;            -- 0.30000000000000004
> SELECT 0.1::numeric + 0.2::numeric;          -- 0.3
> ```
>
> Her `price Float` in `contract.prisma` is a real modelling bug. Fixing `Float` → `Decimal`
> is a Stage 10 exercise, but she should _know why_ now.

---

## 3. Data Types

| SQL type           | Holds                   | Her columns                               |
| ------------------ | ----------------------- | ----------------------------------------- |
| `text`             | any string, unbounded   | `name`, `brand`, `color`                  |
| `integer`          | whole numbers, ±2.1B    | `stock`, `ram`, `storage`, `release_year` |
| `double precision` | float, imprecise        | `price`, `rating`                         |
| `numeric(p,s)`     | exact decimal           | _(she needs this for money)_              |
| `boolean`          | `true` / `false`        | `featured`                                |
| `timestamptz`      | timestamp with timezone | _(User's `created_at`)_                   |
| `uuid`             | 128-bit identifier      | _(she uses `text` instead)_               |

Two ideas that generalize:

- **Type is a constraint.** Postgres will _refuse_ `WHERE stock = 'apple'`. The database
  is the last line of defence, and it never gets tired or distracted.
- **Storage vs. semantics.** Postgres will happily store the string `'active'` in `status`.
  Nothing stops you typing `'Active'`, `'ACTIVE'`, `'actve'`. The database cannot help you
  there — only an `enum` or a `CHECK` can. This is why real schemas rarely use bare `text`
  for a closed set of values.

---

## 4. NULL and Three-Valued Logic — The Most Important Section

`NULL` means **"unknown."** Not empty string. Not zero. Not false. _Unknown._

This breaks every rule she learned in JavaScript.

### Rule 1: `= NULL` never matches

```sql
SELECT count(*) FROM products WHERE color = NULL;    -- 0   ← WRONG
SELECT count(*) FROM products WHERE color IS NULL;   -- 0   ← RIGHT (but 0 is coincidence: no product lacks a color)
SELECT count(*) FROM products WHERE ram IS NULL;     -- 30  ← RIGHT
```

Why? `NULL` means "unknown", so "is this unknown value equal to NULL?" is itself
unknown. Unknown cannot be proven true, so the row is filtered out. You must use `IS NULL`
— it is an operator, not a value comparison.

### Rule 2: `NOT` over NULL produces NULL, not true

This is the one that bites hardest. Real numbers from her table:

```sql
SELECT count(*) FROM products WHERE ram = 16;      -- 23
SELECT count(*) FROM products WHERE ram <> 16;     -- 47  ← NOT 77
SELECT count(*) FROM products WHERE ram IS NULL;   -- 30
-- 23 + 47 + 30 = 100
```

77 would be the JavaScript intuition: "everything that isn't 16." But 30 rows are
_unknown_, so `ram <> 16` is unknown for them, and unknown rows are dropped. **`NOT IN`
and `<>` silently lose NULL rows.**

The fix is COALESCE (Stage 10 will need this for optional filters):

```sql
SELECT count(*) FROM products WHERE COALESCE(ram, 0) <> 16;   -- 77
```

### Rule 3: Arithmetic with NULL is NULL

```sql
SELECT COALESCE(avg(ram), 0) FROM products;   -- real average over 70 known rows
SELECT avg(ram) FROM products;                -- ignores NULLs automatically
```

`avg` ignores NULLs — the built-in functions all follow this convention.

### The three-valued truth table

| `a`  | `b`  | `a = b`  | `a <> b` |
| ---- | ---- | -------- | -------- |
| 1    | 1    | TRUE     | FALSE    |
| 1    | 2    | FALSE    | TRUE     |
| 1    | NULL | **NULL** | **NULL** |
| NULL | NULL | **NULL** | **NULL** |

SQL has three logical values, not two. `WHERE` keeps a row only when the condition is
**TRUE**. FALSE _and_ NULL both drop the row. That is the entire mechanism.

> **Rule of thumb to memorize:** _any comparison with NULL yields NULL, and WHERE only
> passes TRUE._ Every NULL bug in production SQL reduces to this.

---

## 5. Constraints — Rules the Database Enforces

Constraints are business rules that live _inside_ the database so no client can bypass them.

```sql
-- Try each of these and read the error. This is the lesson.
INSERT INTO products (id, name, category, brand, price, rating, stock, status, featured, release_year)
VALUES ('test-1', 'Test', 'laptop', 'Apple', 999, 4.0, 5, 'active', true, 2025);          -- works
INSERT INTO products (id, name, category, brand, price, rating, stock, status, featured, release_year)
VALUES ('test-1', 'Test', 'laptop', 'Apple', 999, 4.0, 5, 'active', true, 2025);          -- FAILS: duplicate PK
INSERT INTO products (id, name, category, brand, price, rating, stock, status, featured, release_year)
VALUES ('test-2', 'Test', 'laptop', 'Apple', 999, 4.0, 5, 'active', true, NULL);          -- FAILS: NOT NULL violated
```

| Constraint    | Guarantees                    | Why it matters                                             |
| ------------- | ----------------------------- | ---------------------------------------------------------- |
| `NOT NULL`    | value is always present       | "unknown price" is never valid                             |
| `PRIMARY KEY` | unique + not null             | rows are addressable                                       |
| `UNIQUE`      | no duplicates in a column set | `User.email` must be unique for login                      |
| `CHECK`       | a boolean rule                | `CHECK (price > 0)`, `CHECK (rating BETWEEN 0 AND 5)`      |
| `FOREIGN KEY` | referenced row exists         | **no orphan rows** — the backbone of referential integrity |
| `DEFAULT`     | value if not supplied         | `now()`, `uuid`                                            |

Clean up after yourself: `DELETE FROM products WHERE id = 'test-1';`

**Teaching moment:** ask her to write a `CHECK (rating >= 0 AND rating <= 5)` and then to
add it to `contract.prisma` as a validation. That is how the abstract becomes concrete.

---

## 6. `SELECT` — The Shape of a Query

```sql
SELECT  name, price          -- 2. what columns come back (projection)
FROM    products             -- 1. which table
WHERE   price > 1000         -- 3. filter rows
ORDER BY price DESC          -- 4. sort
LIMIT   10                   -- 5. how many
OFFSET  20;                  -- 6. skip
```

Clauses are written in this order, though SQL lets you be loose. Learn the canonical order.

### `WHERE` operators

```sql
WHERE price > 1000          -- > < >= <=
WHERE price BETWEEN 500 AND 2000        -- inclusive on BOTH ends
WHERE category IN ('laptop', 'tablet')  -- OR-chain, readable
WHERE category = 'laptop' OR category = 'tablet'   -- same thing, worse
WHERE status = 'active' AND featured = true        -- AND binds tighter than OR
WHERE name LIKE 'MacBook%'             -- % = any chars, _ = exactly one char
WHERE name ILIKE '%macbook%'           -- case-INSENSITIVE  ← her search filter
WHERE ram IS NULL                      -- never = NULL
```

**ALWAYS parenthesize when mixing `AND` and `OR`.** This is the single most common source
of wrong results in hand-written SQL:

```sql
-- WRONG: reads as (featured AND active) OR category='laptop'
WHERE featured = true AND status = 'active' OR category = 'laptop'

-- RIGHT
WHERE (featured = true AND status = 'active') OR category = 'laptop'
```

### `LIKE` performance warning

`LIKE 'MacBook%'` can use an index (it's a prefix match). `LIKE '%macbook%'` **cannot** —
the database must read every row. Her `product.service.js` does `ilike('%search%')`
against `name`, `brand`, `category`. On 100 rows nobody notices. At 1M rows it is a
production incident. This is the bridge to Module 12.

---

## 7. `INSERT`, `UPDATE`, `DELETE`

```sql
INSERT INTO products (id, name, category, brand, price, rating, stock, status, featured, release_year)
VALUES (gen_random_uuid(), 'Test Widget', 'accessory', 'Generic', 19.99, 3.5, 100, 'active', false, 2026);

-- multi-row insert (one round trip, much faster)
INSERT INTO products (id, name, category, brand, price, rating, stock, status, featured, release_year)
VALUES
  (gen_random_uuid(), 'A', 'accessory', 'Generic', 10, 3.0, 1, 'active', false, 2026),
  (gen_random_uuid(), 'B', 'accessory', 'Generic', 20, 3.0, 1, 'active', false, 2026);

UPDATE products SET price = 24.99, stock = stock - 1 WHERE id = '...';

DELETE FROM products WHERE id = '...';
```

### THE most important rule in this module

> **`UPDATE` and `DELETE` without a `WHERE` clause modify every row in the table.**
> There is no undo. There is no undo button. There is no "are you sure?".
> `DELETE FROM products;` — and 100 products are gone forever.

Defences, in order of importance:

1. Always write the `WHERE`. Make it a habit.
2. **Test the `WHERE` with a `SELECT` first.** Always. Non-negotiable.
3. Run destructive statements inside `BEGIN; ... ROLLBACK;` (Module 13).

```sql
-- the professional workflow
BEGIN;
SELECT count(*) FROM products WHERE category = 'accessory';   -- check: is this the right set?
DELETE FROM products WHERE category = 'accessory';
SELECT count(*) FROM products WHERE category = 'accessory';   -- verify
ROLLBACK;                                                     -- changed my mind
```

**Postgres UPDATE gotcha:** in `SET price = price * 1.1`, every `price` on the right side
is the _old_ value. The update is computed from the original row. It is not sequential.

---

## 8. Aggregate Functions

An aggregate collapses many rows into one value.

```sql
SELECT count(*)                FROM products;   -- 100
SELECT count(ram)              FROM products;   -- 70   ← ignores NULL!
SELECT count(*)   FROM products;                  -- 100  ← counts every row
SELECT count(*) AS total, count(ram) AS with_ram,
       count(*) - count(ram) AS missing_ram
FROM products;                 -- 100 | 70 | 30
```

That `count(*)` vs `count(column)` difference is a NULL trap of a different flavour, and a
real one: it is how you measure your own missing data.

```sql
SELECT min(price), max(price), round(avg(price)::numeric, 2) FROM products;
-- 59 | 2799 | 930.80

SELECT sum(stock) FROM products;   -- total inventory
```

> **Notice the `::numeric` cast — and read the error if you omit it:**
>
> ```sql
> SELECT round(avg(price), 2) FROM products;
> -- ERROR:  function round(double precision, integer) does not exist
> ```
>
> Postgres does not silently coerce; many functions come in overloaded variants and
> `double precision` often has no integer-argument version. **Always cast explicitly
> when moving between `float8` and `numeric`.** Because `price` is a `double precision`,
> she will hit this in nearly every aggregate query she writes.

```sql
SELECT
  category,
  count(*)                              AS product_count,
  round(avg(price)::numeric, 2)         AS avg_price,
  round(min(price)::numeric, 2)         AS cheapest,
  round(max(price)::numeric, 2)         AS priciest
FROM products
GROUP BY category
ORDER BY product_count DESC;
```

**Mixing aggregates with non-aggregated columns is illegal.** This is _the_ rule:

> In a `GROUP BY` query, every column in `SELECT` must either appear in `GROUP BY` or be
> wrapped in an aggregate function. No exceptions.

```sql
-- ILLEGAL
SELECT name, count(*) FROM products GROUP BY category;
-- ERROR: column "products.name" must appear in the GROUP BY clause
-- (it would be nondeterministic — which of 20 laptops is "the" one?)
```

---

## 9. `GROUP BY` and `HAVING` — Where vs Having

```sql
SELECT category, count(*)
FROM products
WHERE price > 1000::numeric        -- filters ROWS before grouping
GROUP BY category
HAVING count(*) > 3                -- filters GROUPS after grouping
ORDER BY count(*) DESC;
```

**The execution order that explains it:**

```
FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

- `WHERE` operates on **rows**, before any grouping. It cannot use aggregates.
- `HAVING` operates on **groups**, after grouping. It _can_ use aggregates.

The classic interview question: _"show me categories whose average price exceeds 1000"_.
`WHERE avg(price) > 1000` is a syntax error — the average doesn't exist yet at `WHERE`
time. It must be `HAVING`.

**She is already writing `HAVING` logic in JavaScript** in `product.service.js`. The
grouping, the counting, and the deduping all happen in Node after fetching rows. Moving it
into SQL is the single highest-value change she can make this stage.

---

## 10. `DISTINCT` — Deduplicating in the Database

```sql
SELECT DISTINCT category FROM products ORDER BY category;   -- 11 rows
SELECT DISTINCT brand    FROM products ORDER BY brand;      -- 32 rows
SELECT count(DISTINCT category) FROM products;              -- 11
```

`DISTINCT` applies to the **entire `SELECT` list**, not one column:

```sql
-- these two are DIFFERENT
SELECT DISTINCT category, brand FROM products;   -- distinct (category,brand) PAIRS
SELECT DISTINCT ON (category) category, brand FROM products;  -- one brand per category
```

### The fix for `getMeta`

Here is the current implementation, `src/services/product.service.js:110-117`:

```js
const products = await db.orm.public.Product.select("category", "brand").all();
return {
  total: products.length,
  categories: [...new Set(products.map((p) => p.category))],
  brands: [...new Set(products.map((p) => p.brand))].sort(),
};
```

It fetches **100 rows**, transfers them over the network, and dedupes in JavaScript. The
database already knows the answer.

```sql
SELECT count(DISTINCT category) AS categories, count(DISTINCT brand) AS brands FROM products;
-- 11 | 32
```

```sql
-- and as a single round trip:
SELECT
  (SELECT count(*)                 FROM products) AS total,
  (SELECT count(DISTINCT category) FROM products) AS categories,
  (SELECT count(DISTINCT brand)    FROM products) AS brands;
```

**Assign this as Exercise 1.** She must produce the same JSON using one SQL query through
Prisma, and answer: how many rows crossed the network in each version?

---

## 11. JOINs — The Heart of Relational Design

Everything in `products` is flat. There is no category table, no user, no order. **Joins
are how a relational database becomes more than one table.**

### Setup for practice

```sql
CREATE TEMP TABLE category_info (category text PRIMARY KEY, display_name text, warehouse text);
INSERT INTO category_info VALUES
  ('laptop',    'Laptops',    'WH-A'),
  ('phone',     'Phones',     'WH-A'),
  ('tablet',    'Tablets',    'WH-B'),
  ('gaming',    'Gaming Gear','WH-B'),
  ('headphones','Audio',      'WH-C');

-- 6 categories from products have NO row in category_info
```

### `INNER JOIN` — only rows that match on both sides

```sql
SELECT ci.display_name, count(*) AS products
FROM products p
INNER JOIN category_info ci ON p.category = ci.category
GROUP BY ci.display_name
ORDER BY products DESC;
```

Only 5 categories appear. `accessory`, `camera`, `desktop`, `monitor`, `tv`, `watch` are
**dropped** — they have no matching row. That is the defining behaviour of an inner join:
no match on the right ⇒ the left row disappears.

### `LEFT JOIN` — keep all left rows, fill in NULL where there's no match

```sql
SELECT
  p.category,
  ci.display_name,
  count(*) AS products
FROM products p
LEFT JOIN category_info ci ON p.category = ci.category
GROUP BY p.category, ci.display_name
ORDER BY p.category;
```

Now all 11 categories appear, and the 6 missing ones show `display_name = NULL`.

```
 category   | display_name | products
------------+--------------+----------
 accessory  |              | 10          ← NULL, from the LEFT JOIN
 camera     |              | 10          ← NULL
 desktop    |              | 10          ← NULL
 gaming     | Gaming Gear  | 10
 headphones | Audio        | 10
 laptop     | Laptops      | 20
 ...
```

### When to use which

| Situation                                                        | Use                                    |
| ---------------------------------------------------------------- | -------------------------------------- |
| Every child must have a parent (order **must** belong to a user) | `INNER JOIN`                           |
| Optional relationship (a product _may_ have a featured image)    | `LEFT JOIN`                            |
| You want to find _missing_ parents                               | `LEFT JOIN ... WHERE right.id IS NULL` |

That last pattern is a real technique she will need:

```sql
-- which categories exist in products but have no metadata row? (a data-integrity bug)
SELECT DISTINCT p.category
FROM products p
LEFT JOIN category_info ci ON p.category = ci.category
WHERE ci.category IS NULL;
```

### The `users` table is the perfect JOIN exercise

`users` currently has **0 rows**. Try it:

```sql
SELECT p.name, u.email
FROM products p
LEFT JOIN users u ON u.id = p.id     -- nonsense join, purely to see the behaviour
LIMIT 5;
```

Every `email` is NULL — because `users` is empty, _every_ row fails to match. Ask her:
"with `INNER JOIN` instead, what would you get?" **Answer: zero rows.** The table vanishes.

This is exactly the semantic she will hit in Stage 10 when she adds `Product.owner` →
`User`. Left or inner is a **business decision about missing data**, not a style choice.

Cleanup: temp tables vanish when the psql session ends. No cleanup needed.

---

## 12. Indexes — Why `@@index` Isn't Magic

An index is a separate sorted structure that lets Postgres find rows without reading the
table. It's the difference between O(n) and O(log n).

`contract.prisma` declares five, and Postgres created them (see `\d products` above):

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'products';
```

### Now the lesson: watch the planner _refuse_ to use them

```sql
EXPLAIN select * from products where category = 'laptop';
```

```
Seq Scan on products
  Filter: (category = 'laptop'::text)
```

```sql
EXPLAIN select * from products where price > 2000;
```

```
Seq Scan on products
  Filter: (price > '2000'::double precision)
```

**A Seq Scan — on a table that has a B-tree index on `price`.** Ask her why. The answer:

> With only 100 rows (roughly 20 pages), reading the whole table is _faster_ than
> consulting an index and then chasing down the rows. The planner is not broken. It is
> correctly estimating that a full table scan is cheaper.

This is the most valuable insight in the module. **An index is not a guarantee of
performance — the planner decides, based on statistics.** Indexes cost write throughput
and disk, so Postgres only pays them when it pays off. That is why every table has
`pg_stat` statistics the planner relies on.

```sql
EXPLAIN (ANALYZE, BUFFERS) select * from products where category = 'laptop';
```

Have her notice `actual time` and `rows=`. When they diverge wildly from `estimated rows`,
that's **stale statistics** — and the fix is `ANALYZE products;`, not a new index.

### What indexes actually help

```sql
EXPLAIN select * from products where price BETWEEN 500 AND 1000;   -- range → index usable
EXPLAIN select * from products where name ILIKE '%macbook%';        -- leading wildcard → NEVER usable
```

Leading `%` cannot use a B-tree index, because the index is sorted by prefix and `%Mac`
matches every possible prefix. **This is a live bug in `product.service.js`** — the
`search` filter does `p.name.ilike('%search%')`. The production fix is a **trigram GIN
index**, which you teach in Stage 8.

The general rule: **an index accelerates predicates that constrain a leading, contiguous
portion of the value.** Equality, `<`, `>`, `BETWEEN`, `LIKE 'prefix%'`. Everything else
is a scan.

---

## 13. Transactions & ACID

A transaction is a group of statements that **all succeed or all roll back as a unit.**

```sql
BEGIN;
UPDATE products SET stock = stock - 1 WHERE id = '...';   -- decrement stock
INSERT INTO orders (user_id, total) VALUES (..., 19.99);  -- record the sale
COMMIT;   -- both persisted

-- or, if the order insert fails:
ROLLBACK; -- the stock decrement is UNDONE
```

### Why — the classic failure

Without a transaction, if the process crashes between the two statements, stock is
permanently decremented and no order exists. Money is lost. This is not theoretical; it is
the single most common data-corruption bug in commerce systems.

### ACID

|                 | Meaning                                       | Practical failure it prevents     |
| --------------- | --------------------------------------------- | --------------------------------- |
| **A**tomicity   | all or nothing                                | half-finished order               |
| **C**onsistency | constraints hold before and after             | negative stock                    |
| **I**solation   | transactions don't see each other's half-work | reading a `stock` mid-decrement   |
| **D**urability  | committed data survives a crash               | acknowledged payment, lost record |

Note that **Isolation** is not automatic — it comes from isolation levels:

```sql
SHOW transaction_isolation;    -- default: read committed

BEGIN;
SELECT stock FROM products WHERE id = '...';   -- sees 12
-- meanwhile another connection decrements it to 11 and commits
SELECT stock FROM products WHERE id = '...';   -- sees 11  ← NOT 12. Not repeatable.
COMMIT;
```

Under **read committed** (the default) a `SELECT` inside a transaction can return
different values on repeated execution. If you need consistency within a transaction,
you must ask for `REPEATABLE READ` or `SERIALIZABLE`, or use `SELECT ... FOR UPDATE`.

That is where **lost updates** come from. Read-modify-write without a lock loses data:

```sql
BEGIN;
SELECT stock FROM products WHERE id = '...';  -- both connections read 12
UPDATE products SET stock = 11 WHERE id = '...';   -- both write 11 → one decrement lost
COMMIT;
```

Fix it by locking the row:

```sql
BEGIN;
SELECT stock FROM products WHERE id = '...' FOR UPDATE;   -- other transactions BLOCK here
UPDATE products SET stock = stock - 1 WHERE id = '...';
COMMIT;
```

`FOR UPDATE` is how you get a **row lock**. She will use this in Stage 10 for
"check stock, then reserve stock," and it is what `db.transaction` gives her in Prisma.

---

## 14. Normalization (informal — enough to design a schema)

Normalization = organizing tables so each fact is stored **once**.

Her current schema has the classic smell:

```sql
SELECT brand, category, count(*) FROM products GROUP BY brand, category ORDER BY count(*) DESC;
```

`brand` and `category` are **strings repeated across many rows**. Consequences:

- Change a category name → update 100 rows, and miss one.
- "How many brands are named 'Apple' but spelled 'apple'?" → unanswerable.
- Two products can claim the same real-world product and the DB can't tell.

Normalization fixes this by extracting them:

```sql
brands       (id, name, country)         -- one row per brand
categories   (id, name, slug)            -- one row per category
products     (..., brand_id → brands, category_id → categories)
```

That creates **foreign keys**, which is the entire point — now Postgres guarantees the
brand exists.

The tradeoff: joins cost reads, denormalization trades integrity for speed. Real systems
normalize by default and denormalize deliberately, with measurements.

**This is exactly the Stage 10 exercise** — introducing `categories` as a real table with a
foreign key, which requires learning JOINs first.

---

## 15. Reading a Query Plan — Beyond `EXPLAIN`

```
Limit  (cost=8.30..8.32 rows=1) (actual time=0.015..0.016 rows=1 loops=1)
  ->  Index Scan using products_price_idx on products  (cost=8.29..8.31 rows=1)
        Index Cond: (price > '2000'::double precision)
        Buffers: shared hit=2
Planning Time: 0.047 ms
Execution Time: 0.030 ms
```

Read it **outside-in**:

| Term                     | Meaning                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `Seq Scan`               | read every row — usually fine on small tables                 |
| `Index Scan`             | seek the index, then visit rows                               |
| `Index Only Scan`        | answer entirely from the index — fastest                      |
| `Nested Loop`            | loop the outer, probe the inner (great with few outer rows)   |
| `Hash Join`              | build a hash table — good for large unsorted inputs           |
| `Filter:`                | evaluated _after_ the row is fetched; **cannot** use an index |
| `Index Cond:`            | evaluated _by_ the index; **can** use an index                |
| `rows=` vs `actual rows` | estimate vs reality; big gap = stale stats                    |
| `Buffers: shared hit`    | found in cache (fast) vs `read` (disk, slow)                  |

The `Filter:` vs `Index Cond:` distinction is the one to remember — a predicate in
`Filter:` is work done per row, which is exactly the thing indexes exist to avoid.

---

## Cheat Sheet

```sql
-- projection / filtering
SELECT DISTINCT a, b FROM t WHERE a IS NOT NULL AND b IN ('x','y');
SELECT a FROM t ORDER BY a DESC NULLS LAST LIMIT 10 OFFSET 20;
SELECT a FROM t WHERE a BETWEEN 1 AND 10;

-- aggregation
SELECT a, count(*), sum(b), round(avg(b),2), min(b), max(b)
FROM t GROUP BY a HAVING count(*) > 3;

-- joining
SELECT ... FROM a INNER JOIN b ON a.id = b.a_id;
SELECT ... FROM a LEFT  JOIN b ON a.id = b.a_id WHERE b.id IS NULL;
SELECT ... FROM a JOIN   b USING (id);          -- natural join, same-named column

-- writing
INSERT INTO t (cols) VALUES (...) RETURNING id;    -- insert and get it back
UPDATE t SET a = 1 WHERE id = '...';
DELETE FROM t WHERE id = '...';

-- transactions
BEGIN; ... COMMIT;   /   BEGIN; ... ROLLBACK;

-- diagnosis
EXPLAIN SELECT ...;
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
ANALYZE products;
\d products
```

---

## Exercises

RULES: (1) predict the row count before running, (2) no ORM — `psql` only, (3) destructive
statements inside `BEGIN`/`ROLLBACK`.

### 1. Rewrite `getMeta` in SQL — _the headline task_

Write **one** query that returns total products, distinct categories, and distinct brands.
Then implement it in `product.service.js` with Prisma. Answer in writing: how many rows
did the old version transfer versus the new one?

### 2. NULL hunting

How many products have `ram IS NULL`? How many have `storage IS NULL`? How many have
`processor IS NULL`? Then: why does `count(*)` differ from `count(ram)`? Write one query
reporting `count(*)`, `count(ram)`, `count(storage)`, `count(processor)`.

### 3. The NOT trap

- How many products have `ram = 16`?
- How many have `ram <> 16`?
- Do those two sum to 100? Explain the gap in one sentence using the three-valued truth table.
- Write one query that returns all products that are _not_ 16 GB, correctly.

### 4. Range and set filters

- All laptops between 1000 and 2000, cheapest first.
- All products by Apple, Samsung, or Xiaomi (`IN`).
- All 2025 or 2026 products with rating >= 4.5.
- All active products whose name contains "pro" — case-insensitively.

### 5. Aggregation and grouping

- Average price per category, most expensive average first.
- Only categories with more than 5 products.
- For each brand: product count and total stock, top 5 by count.
- Highest-priced product in each category (`DISTINCT ON`, then `RANK()` as a second attempt).

### 6. Ranking (bonus — window functions)

```sql
SELECT name, price, rank() OVER (ORDER BY price DESC) FROM products ORDER BY price DESC LIMIT 3;
```

Returns `Razer Blade 16` (2799, rank 1), `MSI Raider 18` (2499, rank 2), `Nikon Z6 III`
(2499, rank 2) — **note there is no rank 3, because the tie consumed it.** Explain the
difference between `RANK()`, `DENSE_RANK()` and `ROW_NUMBER()` and give an output where
all three disagree.

### 7. Joins

Using the temp `category_info` table from Module 11:

- Inner join: product count per category with metadata.
- Left join: same, including categories with no metadata.
- List categories present in `products` but **missing** from `category_info` — this is a
  data-integrity bug report.
- Join `products` to the empty `users` table with both an inner and a left join, and explain
  the difference in your own words.

### 8. Constraints

Write a `CHECK (rating >= 0 AND rating <= 5)` constraint on `products` and prove it fires
with a bad insert. Then write `CHECK (price > 0)`. Now try to `ALTER TABLE` to add both to
the real table — and read carefully what Postgres says about the 100 existing rows.

### 9. Transactions

Inside `BEGIN`/`ROLLBACK`:

- Decrement `stock` by 5 for product `id = 1`, then `ROLLBACK`. Prove `stock` is unchanged.
- Now do it again and `COMMIT`. Prove it stuck.
- Start a transaction, read `SELECT count(*) FROM products`, then in a **second psql
  session** insert a row and commit. What does the first session's next `SELECT count(*)`
  return, and why?

### 10. Index diagnosis

- `EXPLAIN` a query filtering `brand = 'Apple'`.
- `EXPLAIN` a query filtering `name ILIKE '%book%'`.
- Explain in writing why the second cannot use the B-tree index, and name the Postgres
  index type that _would_ fix it.
- Run `ANALYZE products;` then re-run one of the above.

---

## Answer Key — Notes Only

<details>
<summary>Attempt every exercise before expanding.</summary>

**2.** `ram` 30 NULL, `storage` 29 NULL, `processor` 10 NULL, `color` 0 NULL. `count(*)`
counts rows; `count(col)` counts rows where the column is non-NULL. The gap _is_ your
missing-data metric.

**3.** `ram = 16` → 23, `ram <> 16` → 47. Sum = 70, not 100. The 30 NULL rows produce
`NULL <> 16` = unknown, and `WHERE` only keeps TRUE. Fix:
`WHERE COALESCE(ram, 0) <> 16` → 77.

**4.** `IN ('Apple','Samsung','Xiaomi')`. Case-insensitive contains:
`WHERE name ILIKE '%pro%'`.

**5.** `HAVING count(*) > 5`. Per-category max:
`SELECT DISTINCT ON (category) category, name, price FROM products ORDER BY category, price DESC;`

**6.** `RANK()` gaps on ties; `DENSE_RANK()` never gaps; `ROW_NUMBER()` breaks ties
arbitrarily and never repeats. `1,2,2` vs `1,2,3` vs `1,2,3`.

**7.** Inner join returns 5 groups; left join returns 11; the "missing" query returns
accessory, camera, desktop, monitor, tv, watch. Inner joining `users` (0 rows) returns
**zero rows**; left join returns all 100 with NULL email.

**8.** `ALTER TABLE products ADD CONSTRAINT ...` **validates all 100 existing rows before
the constraint is accepted.** With `CHECK (rating >= 0 AND rating <= 5)` it _succeeds_,
because every seeded product happens to have a rating in range — that is a lucky
coincidence of the data, not a guarantee. Prove the validation step by adding a rule the
data _does_ violate:

```sql
ALTER TABLE products ADD CONSTRAINT tmp_bad CHECK (price > 2000);
-- ERROR:  check constraint "tmp_bad" of relation "products" is violated by some row
ALTER TABLE products DROP CONSTRAINT tmp_bad;   -- clean up
```

The lesson: **you must fix the data before you can add the constraint.** That is exactly
the ordering problem migrations force you to solve in Stage 9, and it is why a failed
migration is often a _data_ problem wearing a schema costume.

**9.** `ROLLBACK` restores `stock`. `COMMIT` persists it. The read-committed session sees
its own snapshot per statement, so the second `SELECT` **does** see the new count —
because each statement takes a fresh snapshot. Under `REPEATABLE READ` it would not.

**10.** `ILIKE '%book%'` leads with a wildcard; a B-tree is sorted by prefix, so no
contiguous range of the index can be located. Fix: a **trigram GIN index** —
`CREATE INDEX ... USING gin (name gin_trgm_ops)`, which needs `CREATE EXTENSION pg_trgm`.
This is a real production index your `search` filter will require at scale.

</details>

---

## Checkpoint — Is She Ready for Stage 8?

She should be able to answer these **from memory, without running anything**:

1. Why does `WHERE color = NULL` return nothing? What do you write instead?
2. You have 100 rows, 30 with `ram IS NULL`. How many does `ram <> 16` return? Why not 77?
3. `WHERE` vs `HAVING` — which one can use `count(*)`? Why?
4. `count(*)` vs `count(ram)`. What is the difference telling you about your data?
5. Name the four join types and when you'd use each.
6. You add `@@index([price])`. Does Postgres use it? What determines the answer?
7. What does a transaction buy you that two separate queries don't?
8. `price Float` for money — what's wrong and what replaces it?

Plus one practical test: **rewrite `getMeta` in SQL and then in Prisma**, and explain the
difference in rows transferred.

### Common sticking points to watch for

| Symptom                         | Root cause                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| "My `OR` returns too many rows" | missing parentheses around `AND`/`OR`                                                    |
| "COUNT is always 100"           | using `count(*)` where `count(col)` was meant                                            |
| "My filter returns nothing"     | comparing to `NULL` with `=`                                                             |
| "GROUP BY error"                | non-aggregated column missing from `GROUP BY`                                            |
| "My JOIN returns nothing"       | `INNER JOIN` with no matching rows (check for an empty table)                            |
| "Why is it slow?"               | leading `%` in `LIKE`, or function on a column (`LOWER(name)`)                           |
| "I deleted everything"          | missing `WHERE`. Restore practice data with `npm run db:seed` (fix the import bug first) |

---

## Stage 8 Preview (do not start yet)

- PostgreSQL in practice: roles, grants, `psql` administration
- Schemas vs the `public` namespace — why `contract.json` says `"namespace": "public"`
- `pg_trgm` and how trigram indexes make `ILIKE '%...%'` fast
- Full-text search: `tsvector`, `to_tsquery`, GIN indexes
- `EXPLAIN` in depth; `auto_explain`; reading `pg_stat_statements`
- Enum types, composite types, and JSONB
- Sequences and identity columns — the alternative to `uuid()`

Next stage: **Prisma 8 contract-first**, where every concept here gets mapped onto
`contract.prisma`, `db.orm.public.Product`, and the migration workflow.
