#!/bin/bash
dotnet tool install --global dotnet-ef --version 10.0.11
export PATH="$PATH:/root/.dotnet/tools"
cd /src/IguanaSV.Api
dotnet ef database update --context IguanasDbContext --connection "Host=postgres;Port=5432;Database=iguanaSV;Username=postgres;Password=123456789"
