# Gemini Auth Proxy

A standalone Bun application that acts as a transparent OAuth proxy for the Gemini API. It handles PKCE-based OAuth authentication, automatic token refresh, and request/response transformation - allowing Vercel AI SDK clients to use OAuth-authenticated Gemini APIs without managing tokens themselves.

> Inspired by [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) - a Gemini OAuth plugin for the Opencode CLI.

## Features

- **OAuth PKCE Flow** - Secure authentication with Google using PKCE
- **Automatic Token Refresh** - Tokens are refreshed automatically before expiry
- **Request/Response Transformation** - Handles Code Assist API wrapping/unwrapping
- **Web UI** - Simple dark-themed UI for login/logout and status monitoring
- **SQLite Storage** - Tokens persist across restarts

## Prerequisites

- [Bun](https://bun.sh) runtime installed
- A Google account with access to Gemini

## Installation

```bash
git clone https://github.com/ygncode/gemini-auth-proxy.git
cd gemini-auth-proxy
bun install
```

## Usage

### Start the Server

```bash
bun run start
```

The server will start on `http://localhost:8888`.

### Run in Background (pm2)

For persistent background operation, use [pm2](https://pm2.keymetrics.io/):

```bash
# Install pm2 globally (if not already installed)
npm install -g pm2

# Start the proxy in background
pm2 start bun --name "gemini-proxy" -- run start

# Useful pm2 commands
pm2 status              # Check running status
pm2 logs gemini-proxy   # View logs
pm2 restart gemini-proxy  # Restart server
pm2 stop gemini-proxy     # Stop server
pm2 delete gemini-proxy   # Remove from pm2

# Auto-start on system boot (optional)
pm2 startup
pm2 save
```

### Run with Docker

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The server will be available at `http://localhost:8888`.

### Login

1. Open `http://localhost:8888/ui` in your browser
2. Click "Login with Google"
3. Complete the OAuth flow in your browser
4. You're now authenticated!

### Use with Vercel AI SDK

```typescript
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const google = createGoogleGenerativeAI({
  baseURL: "http://localhost:8888/codeassist",
  apiKey: "proxy", // Placeholder - proxy handles real auth
});

const model = google("gemini-2.5-flash");

const result = await generateText({
  model,
  prompt: "Hello!",
});

console.log(result.text);
```

### Proxy Endpoints

| Endpoint | Description |
|----------|-------------|
| `/codeassist/*` | Routes through Code Assist API with OAuth |
| `/gemini/*` | Same as above - alternative path for organization |
| `/ui` | Web UI for login/status/logout |

Both `/codeassist/*` and `/gemini/*` work identically - they're provided for organizational flexibility in your code.

## Examples

Run the included examples:

```bash
# Code Assist endpoint example
bun run example:code-assist

# Gemini endpoint example
bun run example:standard
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run start` | Start the proxy server |
| `bun run dev` | Start with hot reload |
| `bun run example:code-assist` | Run Code Assist example |
| `bun run example:standard` | Run Gemini example |

## How It Works

```
┌─────────────────────┐      ┌──────────────────────────────┐      ┌─────────────────────┐
│   Vercel AI SDK     │      │     gemini-auth-proxy        │      │    Google APIs      │
│   (your app)        │      │        localhost:8888        │      │                     │
│                     │      │                              │      │                     │
│  baseURL:           │─────>│  /codeassist/* or /gemini/*  │─────>│ cloudcode-pa        │
│  localhost:8888/    │      │                              │      │ .googleapis.com     │
│  codeassist         │      │  • OAuth token injection     │      │                     │
│                     │      │  • Request transformation    │      │                     │
│  apiKey: "proxy"    │      │  • Response unwrapping       │      │                     │
└─────────────────────┘      │  • Auto token refresh        │      └─────────────────────┘
                             └──────────────────────────────┘
```

1. Your app sends requests to the proxy with a placeholder API key
2. Proxy injects the real OAuth Bearer token
3. Proxy transforms requests to Code Assist API format
4. Proxy unwraps responses back to standard Gemini format
5. If token is expired, proxy automatically refreshes it

## Project Structure

```
gemini-auth-proxy/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # Bun HTTP server
│   ├── constants.ts       # OAuth credentials, endpoints
│   ├── auth/              # OAuth, token refresh, cache
│   ├── transform/         # Request/response transformation
│   ├── project/           # Managed project discovery
│   ├── routes/            # UI and proxy handlers
│   ├── ui/                # HTMX templates and styles
│   └── db/                # SQLite storage
├── examples/              # Usage examples
└── data/                  # SQLite database (gitignored)
```

## Configuration

The proxy uses Google's Gemini CLI OAuth credentials by default. No additional configuration is required.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| None required | Proxy works out of the box | - |

## Token Storage

Tokens are stored in `data/auth.db` (SQLite). This file is gitignored and contains:
- Refresh token
- Access token
- Token expiry
- User email
- Project ID

## Troubleshooting

### "Not authenticated" error

Visit `http://localhost:8888/ui` and login with Google.

### Token expired

The proxy automatically refreshes tokens. If you see expiry errors, try logging out and back in.

### Port 8888 in use

Kill the existing process:
```bash
lsof -ti:8888 | xargs kill -9
```

## Acknowledgements

This project is inspired by and adapts code from [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth), which provides Gemini OAuth authentication for the Opencode CLI. The OAuth flow, token refresh logic, and request/response transformation patterns are derived from that project.

## License

MIT
