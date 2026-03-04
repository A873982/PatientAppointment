FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api

EXPOSE 8080

CMD ["sh", "-c", "node api/migrate.js && node api/server.js"]
