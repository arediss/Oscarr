import { prisma } from '../../utils/prisma.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
interface AuthResult {
  email: string;
  displayName: string;
  avatar?: string | null;
  providerData: Record<string, unknown>;
}

export async function registerEmail(email: string, password: string, displayName: string): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error('EMAIL_EXISTS');

  if (password.length < 8) throw new Error('PASSWORD_TOO_SHORT');
  if (!displayName.trim()) throw new Error('DISPLAY_NAME_REQUIRED');

  const passwordHash = await hashPassword(password);

  return {
    email: email.toLowerCase(),
    displayName: displayName.trim(),
    providerData: { passwordHash },
  };
}

export async function loginEmail(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error('INVALID_CREDENTIALS');
  if (!user.passwordHash) throw new Error('EXTERNAL_ACCOUNT');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  return {
    email: user.email,
    displayName: user.displayName || user.email,
    avatar: user.avatar,
    providerData: {},
  };
}
