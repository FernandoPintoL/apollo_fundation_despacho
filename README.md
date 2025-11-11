# Apollo Gateway

Apollo Federation Gateway for SWII Hospital Ambulance Dispatch System (HADS)

## Overview

This Apollo Gateway serves as the centralized GraphQL endpoint for all microservices in the SWII architecture. It provides:

- 🔗 **Unified GraphQL API** - Single endpoint for all clients
- 🔐 **Centralized Authentication** - JWT-based auth across all services
- 📊 **Schema Composition** - Automatic composition from federated subgraphs
- 🔄 **Cross-Service References** - Seamless entity references across services
- ⚡ **Performance** - Query batching and caching
- 📈 **Scalability** - Add new services without changing clients

## Architecture

```
┌─────────────────────────────┐
│   Frontend (React)          │
│   Port: 3000                │
└────────────┬────────────────┘
             │ HTTP/WebSocket
             │
┌────────────▼────────────────┐
│   Apollo Gateway            │
│   Port: 4000                │
│   /graphql                  │
└────┬──────┬────────┬────────┘
     │      │        │
┌────▼──┐┌──▼──┐┌───▼──┐┌────▼──┐
│Auth   ││Desp ││WebSo ││ML     │
│8000   ││8001 ││3001  ││5001   │
└───────┘└─────┘└──────┘└───────┘
```

## Project Structure

```
apollo-gateway/
├── src/
│   ├── server.ts              # Main server setup
│   ├── config/
│   │   └── subgraphs.ts      # Subgraph configuration
│   ├── middleware/
│   │   └── authentication.ts  # Auth middleware
│   └── utils/
│       └── logger.ts          # Logging utility
├── package.json
├── tsconfig.json
├── .env.example
├── SCHEMA_DOCUMENTATION.md    # Schema reference
├── FEDERATION_GUIDE.md        # Implementation guide
└── README.md (this file)
```

## Prerequisites

- **Node.js:** >= 18.0.0
- **npm:** >= 9.0.0
- All microservices must be running and accessible

## Installation

```bash
# 1. Navigate to the gateway directory
cd apollo-gateway

# 2. Install dependencies
npm install

# 3. Create .env file from template
cp .env.example .env

# 4. Update .env with your configuration (see Configuration section)
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory. See `.env.example` for all available options:

```env
# Apollo Gateway
NODE_ENV=development
PORT=4000
DEBUG=false

# JWT Configuration
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRATION=24h

# Subgraph URLs
MS_AUTENTIFICACION_URL=http://localhost:8000/graphql
MS_DESPACHO_URL=http://localhost:8001/graphql
MS_WEBSOCKET_URL=http://localhost:3001/graphql
MS_ML_DESPACHO_URL=http://localhost:5001/graphql

# CORS
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=15000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## Development

### Start Development Server

```bash
npm run dev
```

This will start the gateway with hot-reload enabled.

The gateway will be available at:
- **GraphQL Playground:** http://localhost:4000/graphql
- **Health Check:** http://localhost:4000/health

### Build

```bash
npm run build
```

### Start Production Server

```bash
npm run start
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## API Endpoints

### GraphQL Endpoint

**POST** `/graphql`
- GraphQL queries, mutations, and subscriptions
- Requires valid authentication token for protected operations

### Health Check

**GET** `/health`
- Returns gateway and subgraph status

### Example Query

```graphql
query {
  me {
    id
    email
    roles {
      name
    }
  }
}
```

### Authentication

Include JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Schema Documentation

For detailed information about available types, queries, mutations, and subscriptions, see:

- **SCHEMA_DOCUMENTATION.md** - Complete schema reference
- **FEDERATION_GUIDE.md** - Federation implementation guide

## Federation Status

### Current Status (Phase 1: Preparation)

- ✅ Gateway infrastructure setup
- ✅ Configuration system
- ✅ Authentication middleware
- ✅ Schema documentation
- ⏳ Subgraph conversion (Phase 2)
- ⏳ Gateway testing (Phase 5)

### Subgraph Status

| Service | Status | Port |
|---------|--------|------|
| ms_autentificacion | Ready for conversion | 8000 |
| ms_despacho | Ready for conversion | 8001 |
| ms_websocket | Ready for conversion | 3001 |
| ms_ml_despacho | Planning phase | 5001 |

## Development Workflow

### 1. Add New Subgraph

See `FEDERATION_GUIDE.md` for detailed instructions.

### 2. Update Schema

When any subgraph schema changes:
1. Update the service's GraphQL schema
2. Gateway will automatically detect changes
3. Schema composition happens automatically
4. Verify in GraphQL playground

### 3. Test Cross-Service References

```graphql
# This query spans multiple services
query {
  despacho(id: "123") {
    numero
    asignadoA {
      id
      email
      roles {
        name
      }
    }
  }
}
```

## Troubleshooting

### Gateway won't start

1. Check that all subgraph URLs are accessible
2. Verify `.env` configuration
3. Check logs: `DEBUG=true npm run dev`

### Schema composition fails

1. Look for type name conflicts
2. Verify @key directives on entities
3. Check subgraph URLs in `config/subgraphs.ts`

### Slow queries

1. Check network latency to subgraphs
2. Use `DEBUG=true` to trace query execution
3. Monitor rate limiting

### Authentication issues

1. Verify JWT_SECRET matches auth service
2. Check token expiration
3. Verify token format in Authorization header

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 4000

CMD ["node", "dist/server.js"]
```

### Build and Run

```bash
docker build -t apollo-gateway .
docker run -p 4000:4000 --env-file .env apollo-gateway
```

### Docker Compose

See main project `docker-compose.yml` for full setup.

## Monitoring

The gateway exposes metrics in Prometheus format:

```
GET /metrics
```

Metrics include:
- Query latency
- Error rates
- Authentication failures
- Subgraph status

## Performance Tips

1. **Enable Query Caching**
   - Apollo Server caches query plans
   - Cache TTL configurable per query

2. **Batch Requests**
   - Use Apollo Client's batch request feature
   - Reduces network overhead

3. **Monitor Subgraph Performance**
   - Slow subgraphs affect gateway performance
   - Use tracing to identify bottlenecks

4. **Rate Limiting**
   - Configured per `.env`
   - Prevents abuse

## Security

- ✅ **JWT Authentication** - All requests verified
- ✅ **CORS Protection** - Configurable origins
- ✅ **Helmet.js** - Security headers
- ✅ **Rate Limiting** - DOS protection
- ✅ **Input Validation** - GraphQL type system

## Contributing

When making changes:

1. Follow TypeScript best practices
2. Add types to all functions
3. Update documentation
4. Test locally before pushing
5. Follow the existing code style

## Useful Resources

- [Apollo Federation Documentation](https://www.apollographql.com/docs/apollo-server/federation/introduction/)
- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server/)
- [GraphQL Specification](https://spec.graphql.org/)
- [TypeScript Documentation](https://www.typescriptlang.org/)

## License

MIT

## Support

For issues and questions:
- Check FEDERATION_GUIDE.md
- Review SCHEMA_DOCUMENTATION.md
- Check logs with `DEBUG=true`
