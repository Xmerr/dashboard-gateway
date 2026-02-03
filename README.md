# dashboard-gateway

Apollo Gateway service that federates GraphQL subgraphs for the dashboard application. Acts as a unified GraphQL endpoint for the dashboard-web frontend, routing queries to appropriate subgraphs and proxying WebSocket subscriptions.

## Links

- [GitHub](https://github.com/Xmerr/dashboard-gateway)
- [Docker Hub](https://hub.docker.com/r/xmer/dashboard-gateway)

## Quick Start

```bash
docker run -d \
  -e SUBGRAPHS='[{"name":"docker-health-monitor","url":"http://docker:4002/graphql","wsUrl":"ws://docker:4003/graphql"}]' \
  -e RABBITMQ_URL=amqp://user:pass@rabbitmq:5672 \
  -p 4000:4000 \
  -p 4001:4001 \
  xmer/dashboard-gateway:latest
```

## Docker Compose

```yaml
services:
  dashboard-gateway:
    image: xmer/dashboard-gateway:latest
    container_name: dashboard-gateway
    restart: unless-stopped
    environment:
      - PORT=4000
      - SUBGRAPHS=[{"name":"docker-health-monitor","url":"http://docker-health-monitor:4002/graphql","wsUrl":"ws://docker-health-monitor:4003/graphql"}]
      - RABBITMQ_URL=amqp://user:pass@rabbitmq:5672
      - LOKI_HOST=http://loki:3101
      - LOG_LEVEL=info
    ports:
      - "4000:4000"
      - "4001:4001"
    depends_on:
      - docker-health-monitor
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | Gateway HTTP port (WebSocket port is PORT+1) |
| `SUBGRAPHS` | Yes | - | JSON array of subgraph configs (see below) |
| `RABBITMQ_URL` | Yes | - | AMQP connection URI |
| `LOKI_HOST` | No | - | Grafana Loki endpoint for logging |
| `LOG_LEVEL` | No | `info` | Log level (debug, info, warn, error) |

### SUBGRAPHS Format

JSON array where each entry has:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Subgraph identifier |
| `url` | Yes | GraphQL HTTP endpoint |
| `wsUrl` | No | WebSocket endpoint for subscriptions |

Example:

```json
[
  {"name": "docker-health-monitor", "url": "http://docker:4002/graphql", "wsUrl": "ws://docker:4003/graphql"},
  {"name": "disk-space", "url": "http://disk:4004/graphql"}
]
```

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 4000 | HTTP | GraphQL queries and mutations |
| 4001 | WebSocket | GraphQL subscriptions |

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
│   Subgraphs         │
│  (Federation)       │
└─────────────────────┘
```

## Local Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run with coverage
bun run test:coverage

# Start service (requires .env)
bun run start
```
