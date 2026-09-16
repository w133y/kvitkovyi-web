import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

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
      }
    },
  },
});
