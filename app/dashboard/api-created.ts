export const API_CREATED_EVENT = "sheetapi:api-created";

export type DashboardApi = {
  id: number;
  name: string;
  slug: string;
  worksheetName: string;
  status: "ACTIVE" | "DISABLED";
  url: string;
  createdAt: string;
};
