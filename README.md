# real-time-driver-allocation

Real-Time Driver Allocation System for vybe cabs. When a rider requests a ride, the
system identifies the nearest available drivers, notifies multiple drivers
simultaneously, and ensures that only one driver is successfully assigned, based on
the first acceptance.

Stack: NestJS (TypeScript), PostgreSQL, Redis.

> This is the initial setup commit — project scaffolding, Docker services, and the
> Postgres/Redis connections wired into NestJS. The driver allocation logic
> (geo search, concurrency-safe acceptance, timeout/retry, state machine) lands in
> follow-up commits.

## Prerequisites

- Node.js 22+
- Docker + Docker Compose

## Setup

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Start Postgres and Redis:

   ```bash
   docker compose up -d
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Run the app:

   ```bash
   npm run start:dev
   ```

   The app starts on `http://localhost:3001` (see `PORT` in `.env`).

## Services

`docker-compose.yml` brings up:

- **postgres** — Postgres 16, exposed on host port `5434` by default (mapped to
  container port `5432`) to avoid clashing with other local Postgres instances.
- **redis** — Redis 7, exposed on host port `6380` by default (mapped to container
  port `6379`), same reasoning.

Both host ports are configurable via `.env` (`POSTGRES_PORT`, `REDIS_PORT`) if `5434`
or `6380` are already taken on your machine.

To stop the services:

```bash
docker compose down
```

To stop and wipe data volumes:

```bash
docker compose down -v
```

## Project layout

- `src/app.module.ts` — root module; wires up `ConfigModule`, `TypeOrmModule`
  (Postgres), and `RedisModule`.
- `src/redis/redis.module.ts` — global module exposing a shared `ioredis` client
  under the `REDIS_CLIENT` injection token.
