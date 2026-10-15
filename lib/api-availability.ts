export type ApiReadAvailability =
  | "active"
  | "disabled"
  | "spreadsheet_disconnected"
  | "google_disconnected";

export function apiReadAvailability(input: {
  status: "ACTIVE" | "DISABLED";
  spreadsheetSaved: boolean;
  googleConnected: boolean;
}): ApiReadAvailability {
  if (input.status === "DISABLED") {
    return "disabled";
  }

  if (!input.spreadsheetSaved) {
    return "spreadsheet_disconnected";
  }

  if (!input.googleConnected) {
    return "google_disconnected";
  }

  return "active";
}
