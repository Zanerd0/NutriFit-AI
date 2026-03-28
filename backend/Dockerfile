# Use a lightweight version of Node.js
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (helps with caching)
COPY package*.json ./

# Install backend dependencies inside the container
RUN npm install

# Copy the rest of your backend code
COPY . .

# Expose the port your Express server uses
EXPOSE 5000

# The command to start your backend
CMD ["npm", "run", "dev"]