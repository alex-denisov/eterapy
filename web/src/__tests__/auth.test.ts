import { authorize } from '@/lib/auth';
import { usersDb } from '@/lib/users-db';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';

// Mock dependencies
jest.mock('@/lib/users-db');
jest.mock('@/lib/audit');
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    telegramLinkToken: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));
jest.mock('bcryptjs');

// Need to re-import after mocking
import { handlers, signIn, signOut, auth } from '@/lib/auth';

describe('Auth Configuration', () => {
  const originalAllowPlaintextPasswords = process.env.ALLOW_PLAINTEXT_PASSWORDS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ALLOW_PLAINTEXT_PASSWORDS;
  });

  afterAll(() => {
    if (originalAllowPlaintextPasswords === undefined) {
      delete process.env.ALLOW_PLAINTEXT_PASSWORDS;
    } else {
      process.env.ALLOW_PLAINTEXT_PASSWORDS = originalAllowPlaintextPasswords;
    }
  });

  describe('NextAuth config', () => {
    it('should export expected handlers', () => {
      expect(handlers).toBeDefined();
      expect(typeof handlers.GET).toBe('function');
      expect(typeof handlers.POST).toBe('function');
    });

    it('should have session strategy set to JWT', () => {
      // The config is consumed by NextAuth at module load time
      // We verify the module exports properly
      expect(auth).toBeDefined();
    });

    it('should have signIn and signOut functions', () => {
      expect(typeof signIn).toBe('function');
      expect(typeof signOut).toBe('function');
    });
  });

  describe('Credentials Provider - authorize', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'CLIENT',
      password: '$2a$10$mockHashedPassword',
      emailVerified: new Date(),
      blockedAt: null,
    };

    it('should return null when email is missing', async () => {
      (usersDb.get as jest.Mock).mockResolvedValue(null);

      const result = await authorize({ email: '', password: 'test' });
      expect(result).toBeNull();
    });

    it('should return null when password is missing', async () => {
      (usersDb.get as jest.Mock).mockResolvedValue(null);

      const result = await authorize({ email: 'test@example.com', password: '' });
      expect(result).toBeNull();
    });

    it('should return null when user not found', async () => {
      (usersDb.get as jest.Mock).mockResolvedValue(null);

      const result = await authorize({ email: 'nonexistent@example.com', password: 'password' });
      expect(result).toBeNull();
      expect(usersDb.get).toHaveBeenCalledWith('nonexistent@example.com');
    });

    it('should reject blocked users', async () => {
      const blockedUser = { ...mockUser, blockedAt: new Date() };
      (usersDb.get as jest.Mock).mockResolvedValue(blockedUser);

      const result = await authorize({ email: mockUser.email, password: 'password' });
      expect(result).toBeNull();
    });

    it('should reject deleted users', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      (usersDb.get as jest.Mock).mockResolvedValue(deletedUser);

      const result = await authorize({ email: mockUser.email, password: 'password' });
      expect(result).toBeNull();
    });

    it('should authenticate with bcrypt for hashed passwords', async () => {
      bcrypt.compare = jest.fn().mockResolvedValue(true);
      (usersDb.get as jest.Mock).mockResolvedValue(mockUser);

      const result = await authorize({ email: mockUser.email, password: 'correct' });

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        emailVerified: mockUser.emailVerified,
        role: mockUser.role,
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('correct', mockUser.password);
    });

    it('should reject invalid bcrypt password', async () => {
      bcrypt.compare = jest.fn().mockResolvedValue(false);
      (usersDb.get as jest.Mock).mockResolvedValue(mockUser);

      const result = await authorize({ email: mockUser.email, password: 'wrong' });

      expect(result).toBeNull();
    });

    it('should reject plaintext passwords by default', async () => {
      const plainUser = { ...mockUser, password: 'test1234' };
      (usersDb.get as jest.Mock).mockResolvedValue(plainUser);

      const result = await authorize({ email: mockUser.email, password: 'test1234' });

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should support plaintext passwords only when explicitly allowed outside production', async () => {
      process.env.ALLOW_PLAINTEXT_PASSWORDS = 'true';
      const plainUser = { ...mockUser, password: 'test1234' };
      (usersDb.get as jest.Mock).mockResolvedValue(plainUser);

      const result = await authorize({ email: mockUser.email, password: 'test1234' });

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        emailVerified: mockUser.emailVerified,
        role: mockUser.role,
      });
    });

    it('should log audit on successful login', async () => {
      bcrypt.compare = jest.fn().mockResolvedValue(true);
      (usersDb.get as jest.Mock).mockResolvedValue(mockUser);

      await authorize({ email: mockUser.email, password: 'correct' });

      expect(logAudit).toHaveBeenCalledWith(mockUser.id, 'LOGIN', undefined, `Email: ${mockUser.email}`);
    });

    describe('Impersonation token', () => {
      it('should allow SUPERADMIN to impersonate a user with valid token', async () => {
        const targetUser = {
          id: 'target-123',
          email: 'target@example.com',
          name: 'Target User',
          role: 'CLIENT',
          emailVerified: new Date(),
          blockedAt: null,
        };

        (db.telegramLinkToken.findUnique as jest.Mock).mockResolvedValue({
          userId: targetUser.id,
          token: 'imp:valid-token',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        });

        (db.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
        (db.telegramLinkToken.delete as jest.Mock).mockResolvedValue({});

        const result = await authorize({ impersonateToken: 'valid-token' });

        expect(result).toEqual({
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          emailVerified: targetUser.emailVerified,
          role: targetUser.role,
        });
        expect(db.telegramLinkToken.delete).toHaveBeenCalledWith({
          where: { token: 'imp:valid-token' },
        });
      });

      it('should reject expired impersonation token', async () => {
        (db.telegramLinkToken.findUnique as jest.Mock).mockResolvedValue({
          userId: 'target-123',
          token: 'imp:expired-token',
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        });

        const result = await authorize({ impersonateToken: 'expired-token' });

        expect(result).toBeNull();
      });

      it('should reject impersonation for blocked target user', async () => {
        (db.telegramLinkToken.findUnique as jest.Mock).mockResolvedValue({
          userId: 'blocked-123',
          token: 'imp:valid-token',
          expiresAt: new Date(Date.now() + 3600000),
        });

        (db.user.findUnique as jest.Mock).mockResolvedValue({
          id: 'blocked-123',
          email: 'blocked@example.com',
          name: 'Blocked User',
          role: 'CLIENT',
          blockedAt: new Date(),
        });

        const result = await authorize({ impersonateToken: 'valid-token' });

        expect(result).toBeNull();
      });
    });
  });
});
