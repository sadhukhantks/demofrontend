'use client';
import Link from "next/link";
import { Users, LogOut,  Key } from "lucide-react";
import { useState } from "react";
import { logout } from "@/utils/auth";

export function FixedMenuConsole({ isCollapsed }: { isCollapsed: boolean }) {
  const [open, setOpen] = useState(false);

  const handleLogout = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    void logout();
  };

  return (
    <div className="sidebar-section-border">
      <div
        className="sidebar-user-settings"
        onClick={() => setOpen(!open)}
      >
        <Users size={20} className="sidebar-menu-icon" />
        {!isCollapsed && <span className="sidebar-menu-title">User Settings</span>}
      </div>

      {open && !isCollapsed && (
        <div className="sidebar-submenu">
          <Link href="/" className="sidebar-submenu-link" onClick={handleLogout}>
            <LogOut size={16} className="mr-2 inline" /> Logout
          </Link>
          <Link href="/reset-password" className="sidebar-submenu-link">
            <Key size={16} className="mr-2 inline" /> Change Password
          </Link>
        </div>
      )}
    </div>
  );
}
