/* eslint-disable @typescript-eslint/no-require-imports */
require("@testing-library/jest-dom");

const { ReadableStream, TransformStream } = require("node:stream/web");
const { TextDecoder, TextEncoder } = require("node:util");

Object.assign(globalThis, {
  TextDecoder,
  TextEncoder,
  ReadableStream,
  TransformStream,
});

const edgeFetch = require("next/dist/compiled/@edge-runtime/primitives/fetch.js");

Object.assign(globalThis, {
  Request: globalThis.Request ?? edgeFetch.Request,
  Response: globalThis.Response ?? edgeFetch.Response,
  Headers: globalThis.Headers ?? edgeFetch.Headers,
  fetch: globalThis.fetch ?? edgeFetch.fetch,
});

jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    };
  },
  usePathname() {
    return "/";
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

jest.mock("next-auth/react", () => ({
  ...jest.requireActual("next-auth/react"),
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: jest.fn(() => ({
    data: {
      user: {
        id: "test-user-id",
        email: "test@test.com",
        name: "Test User",
        role: "CLIENT",
      },
      expires: new Date().toISOString(),
    },
    status: "authenticated",
  })),
  getSession: jest.fn(() => ({
    user: {
      id: "test-user-id",
      email: "test@test.com",
      name: "Test User",
      role: "CLIENT",
    },
    expires: new Date().toISOString(),
  })),
}));

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
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

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(() => Promise.resolve({ id: "test-email-id" })),
    },
  })),
}));
