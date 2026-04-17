import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Mock next-auth
jest.mock('next-auth/react', () => ({
  ...jest.requireActual('next-auth/react'),
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: jest.fn(() => ({
    data: {
      user: {
        id: 'test-user-id',
        email: 'test@test.com',
        name: 'Test User',
        role: 'CLIENT',
      },
      expires: new Date().toISOString(),
    },
    status: 'authenticated',
  })),
  getSession: jest.fn(() => ({
    user: {
      id: 'test-user-id',
      email: 'test@test.com',
      name: 'Test User',
      role: 'CLIENT',
    },
    expires: new Date().toISOString(),
  })),
}));

// Mock window.matchMedia (only in jsdom env; skipped when testEnvironment=node)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock Resend API
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(() => Promise.resolve({ id: 'test-email-id' })),
    },
  })),
}));
