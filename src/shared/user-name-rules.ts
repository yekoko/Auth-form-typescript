export function checkUsername(userName: string): string[] {
  const errors: string[] = [];

  if (!/\S+@\S+\.\S+/.test(userName)) {
    errors.push("Must use email format: name@domain.tld");
  }

  return errors;
}
