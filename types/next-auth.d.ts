import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      discordId?: string;
      role: Role;
    };
  }
}

declare module "@auth/core/types" {
  interface User {
    discordId?: string | null;
    role?: Role;
  }
}
