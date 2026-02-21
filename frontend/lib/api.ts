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

export const createProject = async (name: string, url: string): Promise<Project> => {
  const { data } = await api.post("/api/v1/projects", { name, url });
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

export const generateSDK = async (id: string, language: string): Promise<Blob> => {
  const response = await api.post(
    `/api/v1/projects/${id}/generate`,
    { language },
    { responseType: "blob" }
  );
  return response.data;
};