/**
 * @vitest-environment jsdom
 *
 * Templates tab: one accordion per template — one per warning (owner
 * 2026-10-11) — (default / company text, saved time), a placeholder chip
 * inserts `{code}` at the caret, Save sends the text and shows the backend's
 * refusal inline, Reset asks first, and "Preview on a case" merges the
 * unsaved text with a case number as the template's own letter. The service
 * is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@/utils/longAbsenteeismService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/longAbsenteeismService")>();
  return {
    ...actual,
    fetchLaTemplates: vi.fn(),
    saveLaTemplate: vi.fn(),
    resetLaTemplate: vi.fn(),
    previewLaLetter: vi.fn(),
  };
});

import {
  fetchLaTemplates,
  previewLaLetter,
  resetLaTemplate,
  saveLaTemplate,
  type LaSetup,
  type LaTemplate,
} from "@/utils/longAbsenteeismService";
import TemplatesTab from "./TemplatesTab";

const WARNING_1: LaTemplate = {
  template_code: "WARNING_1",
  label: "1st warning letter",
  lang: "en",
  subject: "NOTICE",
  body: "Dear , report back.",
  is_default: true,
  updated_date_time: null,
};
const WARNING_2: LaTemplate = {
  ...WARNING_1,
  template_code: "WARNING_2",
  label: "2nd warning letter",
  body: "Despite our earlier letter, {name}.",
};
const WARNING_3: LaTemplate = {
  ...WARNING_1,
  template_code: "WARNING_3",
  label: "3rd & last warning letter",
  body: "Last and final opportunity, {name}.",
};
const SHOW_CAUSE: LaTemplate = {
  template_code: "SHOW_CAUSE",
  label: "Show cause letter",
  lang: "en",
  subject: "SHOW CAUSE",
  body: "Show cause {name}",
  is_default: false,
  updated_date_time: "2026-10-10T16:45:00",
};

const SETUP = {
  stages: [
    { code: "WARNING_1", label: "1st warning", order: 2 },
    { code: "WARNING_2", label: "2nd warning", order: 3 },
    { code: "WARNING_3", label: "3rd & last warning", order: 4 },
  ],
  placeholders: [],
} as unknown as LaSetup;

const onNotify = vi.fn();
const renderTab = (canEdit = true) =>
  render(
    <TemplatesTab
      coId={9}
      branchId={12}
      branches={[{ branch_id: 12, branch_name: "FACTORY" }]}
      setup={SETUP}
      canEdit={canEdit}
      onNotify={onNotify}
    />,
  );

/** The first (expanded) accordion: the 1st warning template. */
const warningPanel = async () => {
  const summary = await screen.findByText(WARNING_1.label);
  return summary.closest(".MuiAccordion-root") as HTMLElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchLaTemplates).mockResolvedValue({
    templates: [WARNING_1, WARNING_2, WARNING_3, SHOW_CAUSE],
    placeholders: [
      { code: "name", label: "Worker's name" },
      { code: "eb_no", label: "EB number" },
    ],
  });
});

describe("TemplatesTab", () => {
  it("lists the templates with their default / company text state", async () => {
    renderTab();
    const panel = await warningPanel();
    // one accordion per warning, in ladder order, then the others
    const titles = Array.from(document.querySelectorAll(".MuiAccordionSummary-content")).map(
      (el) => el.querySelector("p")?.textContent,
    );
    expect(titles).toEqual(["1st warning letter", "2nd warning letter", "3rd & last warning letter", "Show cause letter"]);
    expect(within(panel).getByText("Default")).toBeInTheDocument();
    const sc = screen.getByText(SHOW_CAUSE.label).closest(".MuiAccordion-root") as HTMLElement;
    expect(within(sc).getByText("Company text")).toBeInTheDocument();
    expect(within(sc).getByText("Saved 10-10-2026 16:45")).toBeInTheDocument();
    // The default cannot be reset again.
    expect(within(panel).getByRole("button", { name: /Reset to default/ })).toBeDisabled();
  });

  it("inserts a placeholder at the caret and saves; a refusal shows inline", async () => {
    vi.mocked(saveLaTemplate).mockRejectedValueOnce(new Error("Unknown placeholder {nmae} — use only the listed placeholders"));
    renderTab();
    const panel = await warningPanel();
    const body = within(panel).getByLabelText("Letter text") as HTMLTextAreaElement;
    act(() => body.focus());
    body.setSelectionRange(5, 5);
    // The caret is put back after the token on the next tick: flush it inside act.
    await act(async () => {
      fireEvent.click(within(panel).getByText("{name}"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(body).toHaveValue("Dear {name}, report back.");
    expect(body.selectionStart).toBe(11);

    fireEvent.click(within(panel).getByRole("button", { name: /^Save$/ }));
    await waitFor(() =>
      expect(saveLaTemplate).toHaveBeenCalledWith({
        co_id: 9,
        template_code: "WARNING_1",
        subject: "NOTICE",
        body: "Dear {name}, report back.",
      }),
    );
    expect(await within(panel).findByText(/Unknown placeholder \{nmae\}/)).toBeInTheDocument();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("checks unknown placeholders before saving", async () => {
    renderTab();
    const panel = await warningPanel();
    const body = within(panel).getByLabelText("Letter text");
    fireEvent.change(body, { target: { value: "Dear {nmae}" } });
    fireEvent.click(within(panel).getByRole("button", { name: /^Save$/ }));
    expect(await within(panel).findByText("Unknown placeholder {nmae}")).toBeInTheDocument();
    expect(saveLaTemplate).not.toHaveBeenCalled();
  });

  it("previews the unsaved text on a case number as the template's own warning", async () => {
    vi.mocked(previewLaLetter).mockResolvedValue({
      case_id: 41,
      case_no: "LA/12/26/0001",
      stage_code: "WARNING_2",
      stage_label: "2nd warning",
      template_code: "WARNING_2",
      template_label: "2nd warning letter",
      letter_no: 2,
      subject: "NOTICE",
      body: "Dear RAM KUMAR, report back.",
      editable: false,
      blocked_reason: null,
      blocked_code: null,
      can_force: true,
      issue_date: "2026-10-11",
      due_date: null,
      reply_due_date: null,
      dispatch_mode: null,
    });
    renderTab();
    await warningPanel();
    // Collapsed panels are hidden: open the 2nd warning one.
    fireEvent.click(screen.getByText(WARNING_2.label));
    const panel = screen.getByText(WARNING_2.label).closest(".MuiAccordion-root") as HTMLElement;
    const body = await within(panel).findByLabelText("Letter text");
    expect(body).toHaveValue(WARNING_2.body);
    fireEvent.change(body, { target: { value: "Dear {name}, report back." } });
    // A case number is required.
    fireEvent.click(within(panel).getByRole("button", { name: /^Preview$/ }));
    expect(await within(panel).findByText("Enter a case number")).toBeInTheDocument();
    expect(previewLaLetter).not.toHaveBeenCalled();

    // No warning picker any more: the template decides which warning it is.
    expect(within(panel).queryByLabelText("As the")).not.toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Case number"), { target: { value: " LA/12/26/0001 " } });
    fireEvent.click(within(panel).getByRole("button", { name: /^Preview$/ }));
    await waitFor(() =>
      expect(previewLaLetter).toHaveBeenCalledWith(9, null, "WARNING_2", {
        caseNo: "LA/12/26/0001",
        templateSubject: "NOTICE",
        templateBody: "Dear {name}, report back.",
      }),
    );
    expect(await within(panel).findByTestId("template-preview-body")).toHaveTextContent("Dear RAM KUMAR, report back.");
  });

  it("resets a company text after a confirmation", async () => {
    vi.mocked(resetLaTemplate).mockResolvedValue({ ...SHOW_CAUSE, body: "Default show cause", is_default: true });
    renderTab();
    await warningPanel();
    const sc = screen.getByText(SHOW_CAUSE.label).closest(".MuiAccordion-root") as HTMLElement;
    // Collapsed panels are hidden: open the show cause one first.
    fireEvent.click(screen.getByText(SHOW_CAUSE.label));
    fireEvent.click(await within(sc).findByRole("button", { name: /Reset to default/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(resetLaTemplate).toHaveBeenCalledWith(9, "SHOW_CAUSE"));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/default text/), "success"));
    // Re-read quietly afterwards (saved time / default text).
    expect(fetchLaTemplates).toHaveBeenCalledTimes(2);
  });

  it("read-only without edit access", async () => {
    renderTab(false);
    const panel = await warningPanel();
    expect(screen.getByText(/View only/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /^Save$/ })).not.toBeInTheDocument();
    expect(within(panel).getByLabelText("Letter text")).toHaveAttribute("readonly");
  });
});
