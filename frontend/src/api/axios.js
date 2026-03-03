import axios from "axios";

const instance = axios.create({
  baseURL: "http://localhost:5000/api",
  withCredentials: true, // This is CRITICAL for sending the JWT cookie!
});

export default instance;