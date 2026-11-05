# The image pins the exact Node version, which the Noir SDK's engines range requires.
FROM node:24.22.1-slim
RUN npm install -g pnpm@11.3.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
ENV NODE_ENV=production
CMD ["pnpm", "start"]
