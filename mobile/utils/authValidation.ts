export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordResetErrors {
  confirmPassword?: string;
  password?: string;
}

export function getEmailError(email: string, emptyMessage: string) {
  const cleanEmail = email.trim();

  if (!cleanEmail) {
    return emptyMessage;
  }

  if (!EMAIL_PATTERN.test(cleanEmail)) {
    return "Enter a valid email address.";
  }

  return undefined;
}

export function getPasswordResetErrors(
  password: string,
  confirmPassword: string,
): PasswordResetErrors {
  const nextErrors: PasswordResetErrors = {};

  if (!password) {
    nextErrors.password = "Enter a password.";
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    nextErrors.password = "Use at least eight characters.";
  }

  if (!confirmPassword) {
    nextErrors.confirmPassword = "Confirm your password.";
  } else if (password && confirmPassword !== password) {
    nextErrors.confirmPassword = "Passwords do not match.";
  }

  return nextErrors;
}
