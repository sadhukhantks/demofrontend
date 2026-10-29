FROM node:22-alpine AS build

# Next bakes rewrites() into the build, so the proxy target must be known here.
# "demo-backend" is the backend container on the shared vowerp network.
ARG NEXT_PUBLIC_BACKENDHOST=http://demo-backend:9000
ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG USE_NEXT_PROXY=true
ENV NEXT_PUBLIC_BACKENDHOST=$NEXT_PUBLIC_BACKENDHOST \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    USE_NEXT_PROXY=$USE_NEXT_PROXY \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=4096

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime image: compiled output only, no source.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=5000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 5000
CMD ["node", "server.js"]
