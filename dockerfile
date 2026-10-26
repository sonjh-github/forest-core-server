FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache build-base
COPY native ./native
RUN cc -shared -fPIC -O2 -Wall -Wextra -o /app/rtp-tap.so native/rtp-tap.c -ldl -pthread
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=18020
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/rtp-tap.so ./rtp-tap.so
COPY scripts/restore-existing-disaster.mjs ./scripts/restore-existing-disaster.mjs
USER node
EXPOSE 18020
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:18020/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
