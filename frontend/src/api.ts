import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("crm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("crm_token");
      localStorage.removeItem("crm_user");
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) return error.response?.data?.detail || error.message;
  return "Неизвестная ошибка";
};
