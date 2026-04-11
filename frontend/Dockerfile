# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json first to cache layers
COPY package.json ./

# Install standard dependencies
RUN npm install --legacy-peer-deps

# Force install the missing Webpack dependencies that react-scripts drops
RUN npm install ajv@^8 ajv-keywords@^5

# Copy the rest of the application
COPY . .

# Build the React app
RUN npm run build

# ── Stage 2: Serve with Nginx ────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]