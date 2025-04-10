# Use an official Node.js runtime as a base image
FROM node:20

# Set the working directory
WORKDIR /app

# Copy package files for all parts
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install root dependencies
RUN npm install --include=dev

# Install backend dependencies
WORKDIR /app/backend
RUN npm install --include=dev

# Install frontend dependencies
WORKDIR /app/frontend
COPY frontend/.env* ./
RUN npm install --include=dev

# Go back to root
WORKDIR /app

# Copy the rest of the code
COPY . .

# Expose your app port (update this if needed)
EXPOSE 1025
EXPOSE 3001

# Default command
CMD ["npm", "start"]
