import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://backend-production-f1e1.up.railway.app/api",
});

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Clear token when it's expired or access is denied
      localStorage.removeItem("token");
      
      // Redirect to login page if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
