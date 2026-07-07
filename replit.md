# TitanBot

A feature-rich Discord bot built with Discord.js v14 and PostgreSQL.

## How to run

The **Start application** workflow runs `node src/app.js`. It starts the bot and a small Express health-check API on port 3000.

## Environment variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `CLIENT_ID` | Application/client ID |
| `GUILD_ID` | Server ID for slash command registration |
| `NODE_ENV` | Set to `development` (avoids requiring redundant POSTGRES_* vars) |
| `POSTGRES_HOST/PORT/DB/USER` | Replit managed PostgreSQL (already set) |
| `DATABASE_URL` | Full connection string — managed automatically by Replit |

## Database

Uses Replit's built-in PostgreSQL. The schema is bootstrapped automatically on first run via `AUTO_MIGRATE=true`.

## Music feature (Lavalink)

The music commands require a running Lavalink v4 server. The `LAVALINK_*` env vars are pre-configured for localhost, but no Lavalink server is running — music commands will silently fail until one is provided. You can run one via Docker: `docker-compose up lavalink`.

## Useful scripts

```bash
npm run migrate        # Apply pending migrations
npm run migrate:check  # Verify schema version
npm run backup:db      # Backup the database
npm test               # Run the test suite
```

## User preferences

- Keep existing project structure and stack.
