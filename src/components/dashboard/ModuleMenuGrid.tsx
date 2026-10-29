"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Box, Card, CardActionArea, Typography } from "@mui/material";
import { alpha, lighten, useTheme, type SxProps, type Theme } from "@mui/material/styles";
import { brand } from "@/styles/brand";
import {
  ShoppingCart, Truck, Factory, FlaskConical, Wrench, Boxes, Receipt,
  Settings2, Users, Landmark, Calculator,
  BarChart3, ClipboardList, IndianRupee, CalendarDays, ArrowLeftRight, FileText, ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useSidebarContext, type MenuItem } from "@/components/dashboard/sidebarContext";
import { normalisePortalPath } from "@/utils/portalPermissions";

type Leaf = { menu: MenuItem; group?: string; Icon: LucideIcon };
type Section = { parent: MenuItem; leaves: Leaf[] };

// Keyed on the route segment, not menu_name — names are tenant-editable, the folders under
// src/app/dashboardportal are not. Colour comes from the InfoSky brand (navy + green), not per module.
const MODULES: Record<string, { I: LucideIcon }> = {
  procurement: { I: ShoppingCart },
  jutepurchase: { I: Truck },
  juteproduction: { I: Factory },
  jutesqc: { I: FlaskConical },
  jutemechanical: { I: Wrench },
  inventory: { I: Boxes },
  sales: { I: Receipt },
  masters: { I: Settings2 },
  hrms: { I: Users },
  hrmsmasters: { I: Users },
  accounting: { I: Landmark },
  bomcosting: { I: Calculator },
  jutecosting: { I: Calculator },
  wages: { I: IndianRupee },
};

// Ordered — first match wins, and the order IS the design. Rule 1 before 10/11 so "Machine Master"
// and "Std Moisture Master" read as masters, not machines. Rule 2 early so a module's report block
// shares one glyph and stays scannable ("Jute Stock Report" -> BarChart3, accepted trade).
// ponytail: keyword heuristic, ~85% obviously-right. Upgrade path is an icon_key column on
// menu_mst, NOT a per-menu map in this file.
const RULES: [RegExp, LucideIcon][] = [
  [/master|standard|norm|config|setup|\bmap\b/, Settings2],
  [/report|analysis|summary|trend|pareto|producer|wise\b|exception|deviation/, BarChart3],
  [/checklist|register|\bplan|schedule|board|\blist\b/, ClipboardList],
  [/bill|invoice|\bpay|wage|cash|rate|price|cost|salary|advance|outstanding|voucher|ledger/, IndianRupee],
  [/attendance|leave|holiday|daily|shift|spell|calendar/, CalendarDays],
  [/employee|worker|labour|contractor|hands|\buser|\brole|party|supplier|customer|agent/, Users],
  [/issue|inward|gate|receipt|transfer|delivery|dispatch|movement|consumption/, ArrowLeftRight],
  [/stock|item|store|godown|\bbag|waste|inventory/, Boxes],
  [/order|indent|purchase|quotation|enquiry|\bpo\b/, ShoppingCart],
  [/breakdown|machine|maintenance|overhaul|loom|frame|spindle|spare|trolly/, Wrench],
  [/quality|\bsqc\b|moisture|humidity|inspection|\btest|emulsion/, FlaskConical],
  [/production|doff|spreader|drawing|spinning|winding|weaving|beaming|finishing|carding/, Factory],
];

/** Keyword -> icon, falling back to the module's own glyph. Exported for the ordering test. */
export function resolveIcon(menuName: string, moduleKey: string): LucideIcon {
  const n = menuName.toLowerCase();
  for (const [re, Icon] of RULES) if (re.test(n)) return Icon;
  return MODULES[moduleKey]?.I ?? FileText;
}

// menu_path is stored bare ("juteProduction/spreader"); sidebar prefixes it. Case matters for routing,
// so don't reuse normalisePortalPath (it lowercases) for hrefs.
const toHref = (path: string) =>
  `/dashboardportal/${path.replace(/^\/+/, "").replace(/^dashboardportal\//i, "")}`;

export function ModuleMenuGrid({ modulePath }: { modulePath?: string }) {
  const { availableMenus, parentMenus } = useSidebarContext();
  const dark = useTheme().palette.mode === "dark";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sections = useMemo<Section[]>(() => {
    const menus = Array.isArray(availableMenus) ? availableMenus : [];
    const parents = Array.isArray(parentMenus) ? parentMenus : [];

    const collect = (module: MenuItem): { menu: MenuItem; group?: string }[] => {
      const leaves: { menu: MenuItem; group?: string }[] = [];
      const seen = new Set<number>(); // dedupes by menu_id; also guards a cyclic menu_parent_id
      const walk = (node: MenuItem) => {
        if (seen.has(node.menu_id)) return;
        seen.add(node.menu_id);
        const children = menus.filter((m) => m.menu_parent_id === node.menu_id);
        if (children.length > 0) {
          children.forEach(walk);
          return;
        }
        if (!node.menu_path || node.menu_id === module.menu_id) return;
        const group =
          node.menu_parent_id === module.menu_id
            ? undefined
            : menus.find((m) => m.menu_id === node.menu_parent_id)?.menu_name;
        leaves.push({ menu: node, group });
      };
      walk(module);
      return leaves;
    };

    return parents
      .map((parent) => {
        const raw = collect(parent);
        if (raw.length === 0) return null;
        // parent.menu_path can be empty on some tenants — fall back to the first leaf's path
        const key = (
          normalisePortalPath(parent.menu_path) || normalisePortalPath(raw[0].menu.menu_path)
        ).split("/")[0];
        return {
          parent,
          leaves: raw.map((l) => ({ ...l, Icon: resolveIcon(l.menu.menu_name, key) })),
        };
      })
      .filter((s): s is Section => s !== null);
  }, [availableMenus, parentMenus]);

  const shown = useMemo<Section[]>(() => {
    const target = normalisePortalPath(modulePath);
    if (!target) return sections;
    const exact = sections.find((s) => normalisePortalPath(s.parent.menu_path) === target);
    if (exact) return [exact];
    const byLeaf = sections.find((s) =>
      s.leaves.some((l) => {
        const n = normalisePortalPath(l.menu.menu_path);
        return n === target || n.startsWith(`${target}/`);
      })
    );
    return byLeaf ? [byLeaf] : [];
  }, [sections, modulePath]);

  // Sidebar state hydrates from localStorage — render nothing until mounted.
  if (!mounted) return null;

  if (shown.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No menus available for your role
      </Typography>
    );
  }

  const multi = shown.length > 1;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: multi ? 4 : 0 }}>
      {shown.map((section) => {
        // hoisted per section: alpha()/emotion serialisation runs once, not once per card
        const navy = dark ? lighten(brand.navyInk, 0.55) : brand.navyInk;
        const green = dark ? brand.greenLight : brand.green;

        const cardSx: SxProps<Theme> = {
          height: "100%",
          borderRadius: "10px",
          borderColor: dark ? "divider" : "#e3e8f0",
          borderLeft: `3px solid ${navy}`,
          boxShadow: `0 1px 2px ${alpha(brand.navyInk, 0.06)}`, // theme MuiCard.root forces its own — override it
          transition: "border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
          ...(multi && { contentVisibility: "auto", containIntrinsicSize: "64px" }),
          "&:hover": {
            borderColor: alpha(green, 0.6),
            borderLeftColor: green,
            boxShadow: `0 6px 16px ${alpha(brand.navyInk, 0.12)}`,
            transform: "translateY(-2px)",
            "& .mmg-tile": { bgcolor: green, color: "#fff" },
            "& .mmg-arrow": { opacity: 1, transform: "translateX(0)", color: green },
          },
          "&:active": { transform: "translateY(0)" },
          "@media (prefers-reduced-motion: reduce)": {
            transition: "none",
            "&:hover": { transform: "none" },
          },
        };

        const actionSx: SxProps<Theme> = {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.5,
          px: 1.75,
          py: 1.5,
          minHeight: 64,
          height: "100%",
          "& .MuiCardActionArea-focusHighlight": { opacity: 0 },
          "&.Mui-focusVisible": { outline: `2px solid ${green}`, outlineOffset: "-2px" },
        };

        const tileSx: SxProps<Theme> = {
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: "8px",
          display: "grid",
          placeItems: "center",
          color: navy,
          bgcolor: alpha(brand.navyInk, dark ? 0.35 : 0.08),
          transition: "background-color 140ms ease, color 140ms ease",
        };

        return (
          <Box key={section.parent.menu_id}>
            {multi ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                <Box sx={{ width: 4, height: 18, borderRadius: 1, bgcolor: green, flexShrink: 0 }} />
                <Typography
                  sx={{
                    fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: navy, whiteSpace: "nowrap",
                  }}
                >
                  {section.parent.menu_name}
                </Typography>
                <Box
                  sx={{
                    fontSize: "0.7rem", fontWeight: 700, lineHeight: 1, px: 0.9, py: 0.4,
                    borderRadius: 999, color: green, bgcolor: alpha(green, 0.12),
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {section.leaves.length}
                </Box>
                <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
              </Box>
            ) : (
              // module landing pages render no title of their own — this header is the page title
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: "-0.01em", mb: 0.5, color: navy }}>
                  {section.parent.menu_name}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 2.5 }}>
                  {section.leaves.length} screen{section.leaves.length === 1 ? "" : "s"}
                </Typography>
              </>
            )}
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              }}
            >
              {section.leaves.map(({ menu, group, Icon }) => (
                <Card key={menu.menu_id} variant="outlined" sx={cardSx}>
                  <CardActionArea component={Link} href={toHref(menu.menu_path)} sx={actionSx}>
                    <Box className="mmg-tile" sx={tileSx}>
                      <Icon size={17} strokeWidth={2} aria-hidden />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      {group && (
                        <Typography
                          sx={{
                            fontSize: "0.6875rem", fontWeight: 600, lineHeight: 1.4,
                            letterSpacing: "0.06em", textTransform: "uppercase",
                            color: "text.disabled", mb: 0.25,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {group}
                        </Typography>
                      )}
                      <Typography
                        sx={{
                          fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.35,
                          letterSpacing: "-0.005em", color: navy,
                        }}
                      >
                        {menu.menu_name}
                      </Typography>
                    </Box>
                    <Box
                      className="mmg-arrow"
                      sx={{
                        display: "flex", flexShrink: 0, color: "text.disabled", opacity: 0,
                        transform: "translateX(-4px)", transition: "opacity 140ms ease, transform 140ms ease",
                      }}
                    >
                      <ChevronRight size={16} aria-hidden />
                    </Box>
                  </CardActionArea>
                </Card>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export default ModuleMenuGrid;
