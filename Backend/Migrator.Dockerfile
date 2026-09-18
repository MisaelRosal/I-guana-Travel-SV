# One-shot schema migrator image for docker-compose.
# EF migrations are the single source of truth: this image carries the API project
# (so `dotnet ef` can build and apply them) plus psql to load the reference seed
# AFTER migrations succeed. The container exits 0 on success; compose gates the
# backend on `service_completed_successfully`.
FROM mcr.microsoft.com/dotnet/sdk:10.0

# psql client for the seeding step.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Pin the EF tools version to the runtime EF version (10.0.11).
RUN dotnet tool install --global dotnet-ef --version 10.0.11
ENV PATH="${PATH}:/root/.dotnet/tools"

WORKDIR /app

# Restore first for better layer caching, then build the migrations assembly.
COPY IguanaSV.Api/IguanaSV.Api.csproj IguanaSV.Api/
RUN dotnet restore IguanaSV.Api/IguanaSV.Api.csproj
COPY IguanaSV.Api/ IguanaSV.Api/
RUN dotnet build --no-restore -c Release IguanaSV.Api/IguanaSV.Api.csproj

COPY migrate-and-seed.sh /usr/local/bin/migrate-and-seed.sh
RUN chmod +x /usr/local/bin/migrate-and-seed.sh

ENTRYPOINT ["/usr/local/bin/migrate-and-seed.sh"]
