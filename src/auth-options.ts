import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { env } from "@/lib/env";
import { getAdminByEmail, hasAdminUsers, verifyPassword } from "@/lib/auth-db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email ?? "").trim();
        const password = credentials?.password ?? "";

        if (!email || !password) return null;

        const hasDbAdmins = await hasAdminUsers();

        if (hasDbAdmins) {
          const admin = await getAdminByEmail(email);
          if (!admin) return null;
          const ok = await verifyPassword(password, admin.passwordHash);
          if (!ok) return null;
          return { id: admin.id, email: admin.email, name: "Admin" };
        }

        if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
          if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) return null;
          return { id: "admin", email: env.ADMIN_EMAIL, name: "Admin" };
        }

        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
};
