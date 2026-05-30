import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string;
      emailVerified?: string | null;
      /** Set when the session is being impersonated (B1): the real superadmin id. */
      impersonatedBy?: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role?: string;
    emailVerified?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role?: string;
    email?: string;
  }
}
