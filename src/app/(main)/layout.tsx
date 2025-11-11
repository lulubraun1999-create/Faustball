
import { MainHeader } from "@/components/main-header";
import { MainLayoutClient } from "@/components/main-layout-client";

export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MainHeader />
      <MainLayoutClient>{children}</MainLayoutClient>
    </div>
  );
}
