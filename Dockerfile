# Linux build/test environment. Windows EXE and WinRT OCR are tested separately.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# Desktop binary downloads and postinstall are unnecessary for web compilation.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run test:desktop && npm run typecheck && npm run build \
    && cp -r .next/static .next/standalone/.next/static \
    && node scripts/test-container.mjs

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
