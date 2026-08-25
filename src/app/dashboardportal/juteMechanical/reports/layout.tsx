"use client";
import React from "react";
import { usePathname } from "next/navigation";
import BackToReports from "@/components/reports/BackToReports";

const HUB = "/dashboardportal/juteMechanical/reports";

/**
 * Wraps the Jute Mechanical & Maintenance report pages.
 *
 * Renders "Back to Reports" on every individual report route and hides it on
 * the hub itself (the hub has nowhere to go back to).
 */
export default function JuteMechanicalReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHub = (pathname ?? "").replace(/\/$/, "") === HUB;

  return (
    <>
      {!isHub && <BackToReports hub={HUB} />}
      {children}
    </>
  );
}
