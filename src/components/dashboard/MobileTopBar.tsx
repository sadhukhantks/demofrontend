'use client';
import { LogOut, Menu } from "lucide-react";
import { logout } from "@/utils/auth";

interface MobileTopBarProps {
  /** Opens/closes the off-canvas sidebar drawer. */
  onMenuToggle: () => void;
}

/**
 * Top bar shown only on phone-width screens (hidden from `md` up), used by all
 * three dashboard layouts. Besides the hamburger it carries a Logout button so
 * signing out never requires opening the drawer, scrolling to its bottom and
 * expanding "User Settings" — that bottom strip is often hidden behind mobile
 * browser chrome.
 */
export default function MobileTopBar({ onMenuToggle }: MobileTopBarProps) {
  const handleLogout = () => {
    if (window.confirm("Log out of VoWERP?")) {
      void logout();
    }
  };

  return (
    <div className="md:hidden flex items-center justify-between bg-[hsl(var(--sidebar-bg))] px-4 py-2 shrink-0">
      <button
        type="button"
        onClick={onMenuToggle}
        className="text-white p-2 -ml-2 rounded hover:bg-[hsl(var(--sidebar-accent))]"
        aria-label="Toggle menu"
      >
        <Menu size={24} />
      </button>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-white text-sm px-3 py-2 -mr-2 rounded hover:bg-[hsl(var(--sidebar-accent))]"
        aria-label="Logout"
      >
        <LogOut size={20} />
        <span>Logout</span>
      </button>
    </div>
  );
}
