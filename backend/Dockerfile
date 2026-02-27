FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 5000

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/BurnoutAnalysis.Api/BurnoutAnalysis.Api.csproj", "src/BurnoutAnalysis.Api/"]
COPY ["src/BurnoutAnalysis.Application/BurnoutAnalysis.Application.csproj", "src/BurnoutAnalysis.Application/"]
COPY ["src/BurnoutAnalysis.Domain/BurnoutAnalysis.Domain.csproj", "src/BurnoutAnalysis.Domain/"]
COPY ["src/BurnoutAnalysis.Infrastructure/BurnoutAnalysis.Infrastructure.csproj", "src/BurnoutAnalysis.Infrastructure/"]
RUN dotnet restore "src/BurnoutAnalysis.Api/BurnoutAnalysis.Api.csproj"
COPY . .
WORKDIR "/src/src/BurnoutAnalysis.Api"
RUN dotnet build "BurnoutAnalysis.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "BurnoutAnalysis.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "BurnoutAnalysis.Api.dll"]
