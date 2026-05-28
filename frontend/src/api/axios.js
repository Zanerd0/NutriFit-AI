import axios from "axios";

const instance = axios.create({
  baseURL: "/api", // Vite proxy forwards /api/* → http://backend:5000/api/*
  withCredentials: true, // This is CRITICAL for sending the JWT cookie!
});

export default instance;