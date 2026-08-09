FROM node:20-alpine

# Nodig voor het compileren van better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p data backups

EXPOSE 3000

CMD ["node", "server/index.js"]
