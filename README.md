# I Guana Travel SV

Travel marketplace for El Salvador: hosts publish lodging and experiences, guests book them with simulated payments, and hosts/admins manage everything from their panels.

## Tech stack

- **Frontend:** React 19 + Vite (SPA, served by nginx)
- **Backend:** ASP.NET Core (.NET 10) REST API
- **Database:** PostgreSQL (EF Core migrations + SQL seed)
- **Storage:** MinIO (S3-compatible, publication images)
- **Translation:** LibreTranslate (optional, publication descriptions)

## Quick start

```bash
cp .env.example .env   # fill in the placeholder values
docker compose up -d
```

Then open http://localhost. The one-shot `migrator` service applies EF migrations and the seed before the backend reports healthy.

## Tests

```bash
# Frontend unit tests (jsdom)
cd Frontend && npx vitest run

# Backend tests; integration tests use Testcontainers, so Docker must be running
dotnet test Backend/IguanaSV.Api.sln
```

## Docs

- [LibreTranslate publication translation](docs/libretranslate-publications.md)
