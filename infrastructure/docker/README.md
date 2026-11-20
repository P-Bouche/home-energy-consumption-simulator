# infrastructure/docker — Docker Compose stack

`docker-compose.yml` starts the **db** service: PostgreSQL 16 + PostGIS 3.4
(`postgis/postgis:16-3.4`), bound to `127.0.0.1` only, with its data in the
named volume `postgres_data`.

```bash
cp .env.example .env   # from the repository root
docker compose -f infrastructure/docker/docker-compose.yml up -d
docker compose -f infrastructure/docker/docker-compose.yml exec db psql -U postgres -d hecs
```

The `api` (NestJS) and `web` (Vite) services are added to this compose file
when their images are defined; during P1 they run directly on the host
(`npm run dev:api`, `npm run dev:web` from the repository root) against this
database.

See [docs/deployment.md](../../docs/deployment.md) for the target setup.
