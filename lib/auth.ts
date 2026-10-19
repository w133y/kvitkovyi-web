import { cache } from "react";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { promotePendingAdmin } from "@/lib/site-admins";
import { logError } from "@/lib/admin-log";

// Data minimisation (see /privacy): the site only needs the Discord id, name
// and avatar. So the login asks for the "identify" scope only (no e-mail),
// and Discord's OAuth tokens aren't kept — nothing calls Discord on the
// user's behalf after sign-in.
const baseAdapter = PrismaAdapter(prisma);
const adapter: typeof baseAdapter = {
  ...baseAdapter,
  linkAccount: (account) =>
    baseAdapter.linkAccount!({
      ...account,
      access_token: undefined,
      refresh_token: undefined,
      id_token: undefined,
      expires_at: undefined,
      scope: undefined,
      token_type: undefined,
    }),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [
    Discord({
      // Discord now sends `iss` on the OAuth callback (RFC 9207); without a
      // matching issuer Auth.js compares it to its "https://authjs.dev"
      // fallback and rejects every sign-in (CallbackRouteError).
      issuer: "https://discord.com",
      authorization: { params: { scope: "identify" } },
      profile(profile) {
        const avatar = profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith("a_") ? "gif" : "png"}`
          : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(profile.id) >> BigInt(22)) % BigInt(6))}.png`;
        return { id: profile.id, name: profile.global_name ?? profile.username, image: avatar, email: null };
      },
    }),
  ],
  pages: {
    error: "/auth/error",
  },
  // Every callback failure reaches the user as the same generic
  // ?error=Configuration — the real reason is only in error.cause.err.
  logger: {
    error(error) {
      const cause = (error.cause as { err?: unknown } | undefined)?.err;
      void logError(`auth: ${error.name}`, cause ?? error, error.message);
    },
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
