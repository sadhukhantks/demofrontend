'use client';
import InfoSkyMark from "@/components/ui/InfoSkyMark";
import { brand } from "@/styles/brand";
import { X } from "lucide-react"

interface LogoSectionProps {
  isCollapsed: boolean;
  onToggle: () => void;
  logoSrc: string;
  title: string;
  isMobile?: boolean;
  onClose?: () => void;
}

const LogoSection = ({ isCollapsed, onToggle, isMobile, onClose }: LogoSectionProps) => {
  const handleChangeDashboard = () => {
    window.location.href = "/dashboard";
  };

  return (
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--sidebar-accent))]">
        <div
          className={`logoBlock flex items-center gap-2 cursor-pointer ${isCollapsed ? "mx-auto" : ""}`}
          onClick={handleChangeDashboard}
        >
          <InfoSkyMark size={isCollapsed ? 32 : 40} navy="#ffffff" green={brand.greenLight} />
          {!isCollapsed && (
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-[0.14em]" style={{ color: brand.onNavy }}>
                INFOSKY GLOBAL
              </div>
              <div className="text-[9px] font-semibold tracking-[0.42em]" style={{ color: brand.greenLight }}>
                IT SOLUTIONS
              </div>
            </div>
          )}
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            className="text-white p-1 hover:bg-[hsl(var(--sidebar-accent))] rounded"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
        </div>
  );
};

export default LogoSection; // ✅ Ensure Default Export
