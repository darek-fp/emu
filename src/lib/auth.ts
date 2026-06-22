/**
 * Generate a random temporary password for operator account creation.
 *
 * Requirements:
 * - Minimum 12 characters
 * - Mixed case (upper and lower)
 * - Numbers
 * - Symbols (optional but recommended)
 *
 * @returns A random password string suitable for initial operator login
 */
export function generateTempPassword(): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*-_=+";

  const allChars = uppercase + lowercase + numbers + symbols;

  // Ensure password has at least one of each required character type
  const passwordArray: string[] = [];

  // Add one uppercase
  passwordArray.push(uppercase[Math.floor(Math.random() * uppercase.length)]);

  // Add one lowercase
  passwordArray.push(lowercase[Math.floor(Math.random() * lowercase.length)]);

  // Add one number
  passwordArray.push(numbers[Math.floor(Math.random() * numbers.length)]);

  // Add one symbol
  passwordArray.push(symbols[Math.floor(Math.random() * symbols.length)]);

  // Fill remaining characters (16 - 4 = 12 more characters)
  for (let i = 0; i < 12; i++) {
    passwordArray.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }

  // Shuffle the array to avoid predictable patterns
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
  }

  return passwordArray.join("");
}

/**
 * Verify that a password meets minimum requirements.
 * Used for validation when operators change their password on first login.
 *
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 *
 * @param password Password to validate
 * @returns True if password meets requirements
 */
export function validatePassword(password: string): boolean {
  if (!password || password.length < 8) {
    return false;
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);

  return hasUppercase && hasLowercase && hasNumber;
}
