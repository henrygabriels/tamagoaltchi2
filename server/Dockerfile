# Use Node.js 18 as the base image
FROM node:18-slim

# Set working directory
WORKDIR /app/server

# Copy package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY server/ .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Start the server
CMD ["npm", "start"] 