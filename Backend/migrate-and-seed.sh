#!/bin/sh
# One-shot entrypoint for the compose `migrator` service.
# Order is mandatory: migrations build the schema first (and own
# __EFMigrationsHistory), then the idempotent seed loads reference data.
# This script contains NO schema DDL by design.
set -e

cd /app/IguanaSV.Api

echo "==> Applying EF migrations (single source of truth)"
dotnet ef database update --context IguanasDbContext --configuration Release --no-build

echo "==> Loading idempotent reference seed"
psql -v ON_ERROR_STOP=1 -f /sql/seed.sql

echo "==> Schema migrated and seeded"
