"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Box, Card, CardActionArea, Typography } from "@mui/material";
import { alpha, lighten, useTheme, type SxProps, type Theme } from "@mui/material/styles";
import {
  ShoppingCart, Truck, Factory, FlaskConical, Wrench, Boxes, Receipt,
  Settings2, Users, Landmark, Calculator,
  BarChart3, ClipboardList, IndianRupee, CalendarDays, ArrowLeftRight, FileText,
  type LucideIcon,
} from "lucide-react";
import { useSidebarContext, type MenuItem } from "@/components/dashboard/sidebarContext";
import { normalisePortalPath } from "@/utils/portalPermissions";

type Leaf = { menu: MenuItem; group?: string; Icon: LucideIcon };
type Section = { parent: MenuItem; leaves: Leaf[]; accent: string };

// Keyed on the route segment, not menu_name — names are tenant-editable, the folders under
// src/app/dashboardportal are not. Brand lime #95C11F is deliberately absent so accents never
// compete with primary actions; error/warning/success hues are avoided for the same reason.
const MODULES: Record<string, { c: string; I: LucideIcon }> = {
  procurement: { c: "#2563EB", I: ShoppingCart },
  jutepurchase: { c: "#0891B2", I: Truck },
  juteproduction: { c: "#EA580C", I: Factory },
  jutesqc: { c: "#7C3AED", I: FlaskConical },
  jutemechanical: { c: "#B45309", I: Wrench },
  inventory: { c: "#0D9488", I: Boxes },
  sales: { c: "#DB2777", I: Receipt },
  masters: { c: "#64748B", I: Settings2 }, // slate — recedes; it is the biggest reference section
  hrms: { c: "#4F46E5", I: Users },
  hrmsmasters: { c: "#6366F1", I: Users }, // deliberate indigo sibling of hrms
  accounting: { c: "#16A34A", I: Landmark },
  bomcosting: { c: "#A21CAF", I: Calculator },
};

const RING = Object.values(MODULES).map((m) => m.c);
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

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
          accent: MODULES[key]?.c ?? RING[hash(parent.menu_name) % RING.length],
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
        const accent = section.accent;
        const fg = dark ? lighten(accent, 0.32) : accent;
        const tint = (a: number) => alpha(accent, dark ? a * 1.8 : a);

        const cardSx: SxProps<Theme> = {
          height: "100%",
          borderRadius: 2.5,
          boxShadow: "none", // theme MuiCard.root forces 0 1px 2px — override it
          borderColor: "divider",
          transition: "border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
          ...(multi && { contentVisibility: "auto", containIntrinsicSize: "72px" }),
          "&:hover": {
            borderColor: alpha(accent, 0.55),
            boxShadow: `0 2px 10px ${alpha(accent, 0.14)}`,
            transform: "translateY(-1px)",
            "& .mmg-tile": { bgcolor: tint(0.16) },
          },
          "&:active": { transform: "translateY(0)" },
          "@media (prefers-reduced-motion: reduce)": {
            transition: "none",
            "&:hover": { transform: "none" },
          },
        };

        const actionSx: SxProps<Theme> = {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          gap: 1.25,
          px: 1.75,
          py: 1.5,
          minHeight: 72,
          height: "100%",
          "& .MuiCardActionArea-focusHighlight": { opacity: 0 },
          "&.Mui-focusVisible": { outline: `2px solid ${accent}`, outlineOffset: "-2px" },
        };

        const tileSx: SxProps<Theme> = {
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: "9px",
          display: "grid",
          placeItems: "center",
          color: fg,
          bgcolor: tint(0.1),
          transition: "background-color 120ms ease",
        };

        return (
          <Box key={section.parent.menu_id}>
            {multi ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                <Box sx={{ width: 3, height: 16, borderRadius: 1, bgcolor: accent, flexShrink: 0 }} />
                <Typography
                  sx={{
                    fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "text.secondary", whiteSpace: "nowrap",
                  }}
                >
                  {section.parent.menu_name}
                </Typography>
                <Typography
                  sx={{ fontSize: "0.75rem", color: "text.disabled", fontVariantNumeric: "tabular-nums" }}
                >
                  {section.leaves.length}
                </Typography>
                <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
              </Box>
            ) : (
              // module landing pages render no title of their own — this header is the page title
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: "-0.01em", mb: 0.5 }}>
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
                    <Box sx={{ minWidth: 0 }}>
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
                          letterSpacing: "-0.005em", color: "text.primary",
                        }}
                      >
                        {menu.menu_name}
                      </Typography>
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
