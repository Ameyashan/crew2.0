import { Sidebar } from "@/components/Sidebar";

// Wraps the legacy (pre-redesign) routes with the existing cream sidebar.
// Each legacy screen is being replaced incrementally; this layout will be
// deleted once every screen has moved under /app/*.
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 py-6 md:px-10 md:py-10 overflow-x-hidden">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
