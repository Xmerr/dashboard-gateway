# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apollo Gateway service that federates GraphQL subgraphs for the dashboard application. Acts as a unified GraphQL endpoint for the dashboard-web frontend, routing queries to appropriate subgraphs and proxying WebSocket subscriptions.

Uses [`@xmer/consumer-shared`](../../consumer-shared/) for logging and common utilities.

## Commands

```bash
bun install              # Install dependencies
bun run build            # Compile TypeScript to dist/
bun run lint             # Run Biome linter/formatter
bun run lint:fix         # Auto-fix lint issues
bun test                 # Run all tests
bun run test:coverage    # Run tests with coverage (95% threshold)
bun run start            # Run service (requires .env file)
```

## Architecture

```
┌─────────────────────┐
│   dashboard-web     │
│  (React frontend)   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  dashboard-gateway  │
│   (Apollo Gateway)  │
│                     │
│  HTTP :4000/graphql │
│  WS   :4001/graphql │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│docker-health-monitor│
│    (Subgraph)       │
│                     │
│  HTTP :4002/graphql │
│  WS   :4003/graphql │
└─────────────────────┘
```

### Key Components

- **`src/index.ts`**: Service entry point. Creates logger, initializes gateway, handles graceful shutdown.

- **`src/config/config.ts`**: Environment variable parsing with validation.

- **`src/gateway/apollo-gateway.ts`**: Apollo Gateway setup with IntrospectAndCompose for federation. Includes WebSocket proxy for subscription passthrough to subgraphs.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | Gateway HTTP port (WS is PORT+1) |
| `SUBGRAPHS` | Yes | - | JSON array of subgraph configs (see below) |
| `RABBITMQ_URL` | Yes | - | AMQP connection URI (for future use) |
| `LOKI_HOST` | No | - | Grafana Loki endpoint |
| `LOG_LEVEL` | No | `info` | Log level |

### SUBGRAPHS Format

JSON array where each entry has:
- `name` (required): Subgraph identifier
- `url` (required): GraphQL HTTP endpoint
- `wsUrl` (optional): WebSocket endpoint for subscriptions

```bash
SUBGRAPHS='[{"name":"docker-health-monitor","url":"http://localhost:4002/graphql","wsUrl":"ws://localhost:4003/graphql"}]'
```

Adding more subgraphs:
```bash
SUBGRAPHS='[
  {"name":"docker-health-monitor","url":"http://docker:4002/graphql","wsUrl":"ws://docker:4003/graphql"},
  {"name":"qbittorrent","url":"http://qbit:4004/graphql"},
  {"name":"disk-space","url":"http://disk:4005/graphql","wsUrl":"ws://disk:4006/graphql"}
]'
```

## GraphQL Schema

The gateway federates the following subgraphs:

### docker-health-monitor

```graphql
type Query {
  containers: [Container!]!
  container(id: ID!): Container
}

type Mutation {
  refreshContainers: RefreshResult!
}

type RefreshResult {
  success: Boolean!
  message: String
}

type Subscription {
  containerStatusChanged: ContainerStatusEvent!
  containerAlert: ContainerAlertEvent!
}

type Container @key(fields: "id") {
  id: ID!
  name: String!
  image: String!
  status: ContainerStatus!
  uptimeSeconds: Int!
  restartCount: Int!
}
```

## Subscription Handling

Apollo Gateway doesn't natively support federated subscriptions. This gateway implements a WebSocket proxy that:

1. Accepts WebSocket connections on port 4001
2. Forwards subscription requests directly to the docker-health-monitor subgraph
3. Relays subscription events back to the client

## Docker Setup

```yaml
services:
  dashboard-gateway:
    image: xmer/dashboard-gateway:latest
    environment:
      - DOCKER_SUBGRAPH_URL=http://docker-health-monitor:4002/graphql
      - RABBITMQ_URL=amqp://user:pass@rabbitmq:5672
    ports:
      - "4000:4000"  # HTTP
      - "4001:4001"  # WebSocket
    depends_on:
      - docker-health-monitor
```
