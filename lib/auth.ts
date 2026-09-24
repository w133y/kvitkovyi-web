import { cache } from "react";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { promotePendingAdmin } from "@/lib/site-admins";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Discord],
  pages: {
    error: "/auth/error",
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.discordId = user.discordId ?? undefined;
      session.user.role = user.role ?? "USER";
      return session;
    },
  },
  events: {
    async linkAccount({ user, account }) {
      if (account.provider === "discord") {
        await prisma.user.update({
          where: { id: user.id },
          data: { discordId: account.providerAccountId },
        });
        // Granted site admin from the Discord panel before they had an account.
        await promotePendingAdmin(user.id!, account.providerAccountId);
      }
    },
  },
});

// auth() hits the session table on every call; the root layout and the
// per-section access check both need it on every page. This shares one
// lookup per request between them.
export const getSession = cache(() => auth());
