export class GooglePickerConfigError extends Error {
  constructor() {
    super("Google Picker is not configured");
    this.name = "GooglePickerConfigError";
  }
}

const PICKER_API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{20,180}$/;
const PROJECT_NUMBER_PATTERN = /^\d{6,20}$/;

export function getGooglePickerConfig() {
  const developerKey = process.env.GOOGLE_PICKER_API_KEY ?? "";

  if (!PICKER_API_KEY_PATTERN.test(developerKey)) {
    throw new GooglePickerConfigError();
  }

  const explicitAppId = process.env.GOOGLE_APP_ID;

  if (explicitAppId) {
    if (!PROJECT_NUMBER_PATTERN.test(explicitAppId)) {
      throw new GooglePickerConfigError();
    }

    return { developerKey, appId: explicitAppId };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const projectNumber = /^(\d{6,20})-/.exec(clientId)?.[1];

  if (!projectNumber) {
    throw new GooglePickerConfigError();
  }

  return { developerKey, appId: projectNumber };
}
