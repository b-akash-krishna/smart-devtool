import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  withCredentials: false,
});

export interface Project {
  id: string;
  name: string;
  base_url: string;
  status: "PENDING" | "SCRAPING" | "PARSING" | "COMPLETED" | "FAILED";
  created_at: string;
  api_name: string | null;
  api_description: string | null;
  auth_scheme: { type: string; header_name: string; description: string } | null;
}

export interface Endpoint {
  id: string;
  method: string;
  path: string;
  summary: string;
  parameters: Parameter[];
  tags: string[];
}

export interface Parameter {
  name: string;
  type: string;
  location: string;
  required: boolean;
  description: string;
}

export interface EndpointsResponse {
  project_id: string;
  api_name: string;
  auth: Project["auth_scheme"];
  endpoint_count: number;
  endpoints: Endpoint[];
}

export interface RateLimitStatus {
  used: number;
  limit: number;
  remaining: number;
  reset_in_seconds: number;
}

export const createProject = async (
  name: string, url: string, use_case: string = "", force_refresh: boolean = false
): Promise<Project> => {
  const { data } = await api.post("/api/v1/projects", { name, url, use_case, force_refresh });
  return data;
};

export const getProject = async (id: string): Promise<Project> => {
  const { data } = await api.get(`/api/v1/projects/${id}`);
  return data;
};

export const getEndpoints = async (id: string): Promise<EndpointsResponse> => {
  const { data } = await api.get(`/api/v1/projects/${id}/endpoints`);
  return data;
};

export const generateSDK = async (
  id: string,
  language: string,
  endpoints?: Endpoint[]
): Promise<Blob> => {
  const payload: any = { language };
  if (endpoints) payload.endpoints = endpoints;
  const response = await api.post(
    `/api/v1/projects/${id}/generate`,
    payload,
    { responseType: "blob" }
  );
  return response.data;
};

export const previewSDK = async (id: string, language: string): Promise<string> => {
  const { data } = await api.get(`/api/v1/projects/${id}/preview?language=${language}`);
  return data;
};

export const getRateLimitStatus = async (): Promise<RateLimitStatus> => {
  const { data } = await api.get("/api/v1/projects/rate-limit-status");
  return data;
};

export const listProjects = async (): Promise<Project[]> => {
  const { data } = await api.get("/api/v1/projects");
  return data;
};

export const exportOpenAPI = async (id: string, format: "json" | "yaml"): Promise<Blob> => {
  const response = await api.get(`/api/v1/projects/${id}/export?format=${format}`, {
    responseType: "blob"
  });
  return response.data;
};

export const getSuggestions = async (id: string): Promise<any> => {
  const { data } = await api.get(`/api/v1/projects/${id}/suggestions`);
  return data;
};