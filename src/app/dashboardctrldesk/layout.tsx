"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import MobileTopBar from "@/components/dashboard/MobileTopBar"
import SidebarConsole from "@/components/dashboard/sidebarConsole"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer once navigation lands on the new page
  useEffect(() => { setIsMobileMenuOpen(false); }, [pathname]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-100">
      {/* Mobile top bar (hamburger + logout) — visible only on small screens */}
      <MobileTopBar onMenuToggle={() => setIsMobileMenuOpen(prev => !prev)} />

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ponytail: one sidebar instance — off-canvas drawer on phone, static column on md+
          (a second mounted instance would re-fetch the menu on every drawer open) */}
      <div className={`${isMobileMenuOpen ? "fixed inset-y-0 left-0 w-56 z-50" : "hidden"} md:static md:block md:w-auto md:z-auto`}>
        <SidebarConsole
          isCollapsed={isMobileMenuOpen ? false : isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobile={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
