export function checkComplexity(plainPassword: string): string[] {
  const errors: string[] = [];
  if (plainPassword.length < 8) {
    errors.push("Password must be at least 8 characters long.");
  }
  return errors;
}
