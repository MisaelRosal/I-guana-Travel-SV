#!/bin/bash
# Local/manual migration helper. Credentials come from the environment (see
# .env.example); this file MUST NOT contain committed database secrets.
dotnet tool install --global dotnet-ef --version 10.0.11
export PATH="$PATH:/root/.dotnet/tools"
cd /src/IguanaSV.Api
dotnet ef database update --context IguanasDbContext \
  --connection "Host=${PGHOST:-postgres};Port=${PGPORT:-5432};Database=${POSTGRES_DB:-iguana_sv};Username=${POSTGRES_USER:-postgres};Password=${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in the environment}"
