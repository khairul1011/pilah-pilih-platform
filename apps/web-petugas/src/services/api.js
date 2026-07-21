import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://backend-production-f1e1.up.railway.app/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
