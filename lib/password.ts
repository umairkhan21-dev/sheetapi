export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;
export const BCRYPT_ROUNDS = 12;

export const PASSWORD_REQUIREMENT_MESSAGE = `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;

export const PASSWORD_RESET_REQUEST_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";

export const PASSWORD_RESET_INVALID_MESSAGE =
  "This password reset link is invalid or has expired.";

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Your password has been reset. You can log in with your new password.";

export function getPasswordValidationError(password: string) {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return PASSWORD_REQUIREMENT_MESSAGE;
  }

  return null;
}
