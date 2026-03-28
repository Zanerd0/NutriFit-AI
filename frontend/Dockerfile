FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Expose the port Vite uses
EXPOSE 5173

# Start the Vite development server
CMD ["npm", "run", "dev", "--", "--host"]