"use client";

import * as React from "react";
import { Box, Button, Checkbox, Chip, Stack, Typography } from "@mui/material";
import { ChevronRight } from "lucide-react";
import { CardStat, MobileCard, TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaListRow } from "@/utils/longAbsenteeismService";
import { dueText, isDue, leaveChipColor, leaveChipText } from "../_utils";
import { ApprovalChip, CaseStatusChip, StageChip } from "./Chips";

export interface WatchlistCardsProps {
  rows: LaListRow[];
  today: string;
  onOpen: (row: LaListRow) => void;
  /** Shows a checkbox per card for "Issue letters for selected". */
  selectable: boolean;
  selected: ReadonlySet<number>;
  onToggle: (caseId: number, checked: boolean) => void;
  emptyText: string;
}

/** Phone layout of the watchlist: one card per case, thumb-sized Open. */
export default function WatchlistCards({
  rows,
  today,
  onOpen,
  selectable,
  selected,
  onToggle,
  emptyText,
}: WatchlistCardsProps) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        {emptyText}
      </Typography>
    );
  }
  return (
    <Stack spacing={1.25}>
      {rows.map((r) => {
        const leave = leaveChipText(r, today);
        return (
          <MobileCard
            key={r.case_id}
            header={
              <>
                {selectable ? (
                  <Checkbox
                    checked={selected.has(r.case_id)}
                    onChange={(e) => onToggle(r.case_id, e.target.checked)}
                    slotProps={{ input: { "aria-label": `Select ${r.emp_name ?? r.emp_code ?? r.case_id}` } }}
                    sx={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, ml: -1 }}
                  />
                ) : null}
                <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
                    {r.emp_name || "(no name)"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    EB {r.emp_code ?? r.eb_id}
                    {r.dept_desc ? ` · ${r.dept_desc}` : ""}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<ChevronRight size={14} />}
                  onClick={() => onOpen(r)}
                  sx={{ minHeight: TOUCH_TARGET }}
                >
                  Open
                </Button>
              </>
            }
          >
            <CardStat label="Stage" value={<StageChip code={r.stage_code} label={r.stage_label} />} />
            <CardStat label="Absent days" value={String(r.absent_days)} align="right" />
            <CardStat
              label="Next due"
              value={
                r.status === 0 ? (
                  <CaseStatusChip status={r.status} label={r.exit_reason_label || r.status_label} />
                ) : (
                  <Box component="span" sx={{ color: isDue(r.next_due_date, today) ? "warning.main" : "inherit" }}>
                    {dueText(r.next_due_date, today) || "—"}
                  </Box>
                )
              }
            />
            <CardStat label="Last working" value={fmtDate(r.last_working_date)} align="right" />
            {r.status_id != null ? (
              <Box sx={{ gridColumn: "1 / -1" }}>
                <ApprovalChip statusId={r.status_id} level={r.approval_level} />
              </Box>
            ) : null}
            {leave ? (
              <Box sx={{ gridColumn: "1 / -1", minWidth: 0 }}>
                <Chip size="small" color={leaveChipColor(r, today)} label={leave} sx={{ maxWidth: "100%" }} />
              </Box>
            ) : null}
            {r.remarks ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ gridColumn: "1 / -1", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {r.remarks}
              </Typography>
            ) : null}
          </MobileCard>
        );
      })}
    </Stack>
  );
}
