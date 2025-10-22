import { ProfileSidebarNav } from "@/components/profile-sidebar-nav";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="lg:w-1/5">
          <ProfileSidebarNav />
        </aside>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
