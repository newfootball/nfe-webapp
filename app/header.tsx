"use client";

import { Layout } from "@/components/layout";
import type { User } from "@prisma/client";
import { LogInIcon, UserIcon } from "lucide-react";
import { getSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export const Header = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const session = await getSession();
      setUser(session?.user as User | null);
    };
    fetchUser();
  }, []);

  return (
    <header className="w-full border-b border-border px-2">
      <Layout>
        <h1 className="flex-1">
          <Link href="/">
            <Image src="/logo.svg" alt="logo" width={36} height={36} />
          </Link>
        </h1>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/profile">
              <UserIcon className="w-6 h-6" />
            </Link>
          ) : (
            <Link href="/sign-in" className="text-sm flex items-center gap-2">
              Sign In <LogInIcon className="w-6 h-6" />
            </Link>
          )}
        </div>
      </Layout>
    </header>
  );
};
