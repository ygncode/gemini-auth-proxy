FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose ports (main server and OAuth callback)
EXPOSE 8888 8085

# Start the application
CMD ["bun", "run", "src/index.ts"]
