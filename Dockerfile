# Stage 1: install all deps, compile the TypeScript backend (tsc -> build/) and
# build the React frontend (vite -> dist/). Needs the devDependencies.
FROM node:24-alpine AS build
WORKDIR /app
# The scaffold deliberately ships WITHOUT a package-lock.json (it can't be
# generated offline at scaffold time), so use `npm install`, not `npm ci`.
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: runtime image - compiled backend + built frontend, prod deps only
# (no typescript/vite/react at runtime).
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
# La dichiarazione delle variabili d'ambiente: src/platform/config.ts la legge a
# runtime per servire /_self-en/config e sapere cosa manca.
COPY self-en.json ./

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

USER node
CMD ["node", "build/server.js"]
