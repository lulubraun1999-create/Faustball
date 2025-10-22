"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MainHeader } from "@/components/main-header";
import { Loader2 } from "lucide-react";

export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const user = localStorage.getItem("faustapp_user");
    if (!user) {
      router.replace("/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <MainHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
