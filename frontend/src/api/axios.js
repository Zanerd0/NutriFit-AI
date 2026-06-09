import axios from "axios";
import { API_BASE } from "./config";

const instance = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // This is CRITICAL for sending the JWT cookie!
});

export default instance;