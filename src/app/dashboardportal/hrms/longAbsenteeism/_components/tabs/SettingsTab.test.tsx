/**
 * @vitest-environment jsdom
 *
 * Settings tab: the rule loads into the form, Zod stops bad days before the
 * call, Save sends the whole rule (days as numbers, the excluded EB prefixes
 * as typed, blank texts as null) then re-reads /setup, and a backend refusal
 * shows inline. The service is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@/utils/longAbsenteeismService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/longAbsenteeismService")>();
  return { ...actual, fetchLaRule: vi.fn(), saveLaRule: vi.fn() };
});

import { fetchLaRule, saveLaRule, type LaRule } from "@/utils/longAbsenteeismService";
import SettingsTab from "./SettingsTab";

const RULE: LaRule = {
  co_id: 9,
  detect_days: 10,
  lookback_days: 90,
  wait_w2_days: 10,
  wait_w3_days: 10,
  wait_sc_days: 15,
  sc_reply_days: 3,
  notice_reply_days: 7,
  dismiss_snooze_days: 30,
  exclude_prefixes: "T,C,R,L",
  exclude_t_codes: 1,
  clause_text: "Clause 14(C)(V)",
  signatory: "Personnel Manager",
  extra_1_label: null,
  extra_2_label: null,
  extra_3_label: null,
  extra_4_label: null,
  extra_5_label: null,
};

const onNotify = vi.fn();
const onSetupChanged = vi.fn();
const renderTab = (canEdit = true) =>
  render(
    <SettingsTab
      coId={9}
      branchId={12}
      branches={[{ branch_id: 12, branch_name: "FACTORY" }]}
      setup={null}
      canEdit={canEdit}
      onNotify={onNotify}
      onSetupChanged={onSetupChanged}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchLaRule).mockResolvedValue(RULE);
});

describe("SettingsTab", () => {
  it("saves the rule and re-reads the setup", async () => {
    vi.mocked(saveLaRule).mockResolvedValue({ ...RULE, wait_w2_days: 12, extra_1_label: "Union" });
    renderTab();
    const w2 = await screen.findByLabelText("2nd warning after");
    expect(w2).toHaveValue("10");
    expect(screen.getByText(/after the 1st warning's sent date/)).toBeInTheDocument();
    fireEvent.change(w2, { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Extra column 1"), { target: { value: " Union " } });
    const prefixes = screen.getByLabelText("Excluded EB prefixes");
    expect(prefixes).toHaveValue("T,C,R,L");
    expect(screen.getByText(/Workers whose EB No starts with one of these.*Default T,C,R,L\./)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.change(prefixes, { target: { value: " t, c " } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    await waitFor(() => expect(saveLaRule).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveLaRule).mock.calls[0][0]).toEqual({
      co_id: 9,
      detect_days: 10,
      lookback_days: 90,
      wait_w2_days: 12,
      wait_w3_days: 10,
      wait_sc_days: 15,
      sc_reply_days: 3,
      notice_reply_days: 7,
      dismiss_snooze_days: 30,
      exclude_prefixes: "t, c",
      clause_text: "Clause 14(C)(V)",
      signatory: "Personnel Manager",
      extra_1_label: "Union",
      extra_2_label: null,
      extra_3_label: null,
      extra_4_label: null,
      extra_5_label: null,
    });
    await waitFor(() => expect(onSetupChanged).toHaveBeenCalledTimes(1));
    expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/Settings saved/), "success");
  });

  it("stops bad days before the call", async () => {
    renderTab();
    const detect = await screen.findByLabelText("Detect after");
    fireEvent.change(detect, { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Look back"), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("2nd warning after"), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(await screen.findByText("Enter whole days between 1 and 365")).toBeInTheDocument();
    expect(screen.getByText("Enter whole days between 0 and 3650")).toBeInTheDocument();
    expect(screen.getByText("Enter whole days between 0 and 365")).toBeInTheDocument();
    expect(saveLaRule).not.toHaveBeenCalled();
  });

  it("look back 0 = no limit: explained, accepted and sent as 0", async () => {
    vi.mocked(saveLaRule).mockResolvedValue({ ...RULE, lookback_days: 0 });
    renderTab();
    const lookback = await screen.findByLabelText("Look back");
    expect(screen.getByText(/0 = no limit \(every worker on the roll absent at least the detect days is listed\)/))
      .toBeInTheDocument();
    expect(lookback).toHaveAttribute("maxlength", "4");
    fireEvent.change(lookback, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(await screen.findByText("Use 0 (no limit) or at least the detection days (10)")).toBeInTheDocument();
    expect(saveLaRule).not.toHaveBeenCalled();
    fireEvent.change(lookback, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    await waitFor(() => expect(saveLaRule).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveLaRule).mock.calls[0][0].lookback_days).toBe(0);
  });

  it("stops bad EB prefixes before the call; blank goes as null (the default)", async () => {
    vi.mocked(saveLaRule).mockResolvedValue(RULE);
    renderTab();
    const prefixes = await screen.findByLabelText("Excluded EB prefixes");
    fireEvent.change(prefixes, { target: { value: "T,C1" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(await screen.findByText("Use letters, commas and spaces only")).toBeInTheDocument();
    fireEvent.change(prefixes, { target: { value: "TC" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(await screen.findByText(/One letter per prefix/)).toBeInTheDocument();
    expect(saveLaRule).not.toHaveBeenCalled();
    fireEvent.change(prefixes, { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    await waitFor(() => expect(saveLaRule).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveLaRule).mock.calls[0][0].exclude_prefixes).toBeNull();
  });

  it("shows the backend's refusal inline", async () => {
    vi.mocked(saveLaRule).mockRejectedValueOnce(new Error("lookback_days must be at least detect_days"));
    renderTab();
    fireEvent.change(await screen.findByLabelText("Signatory"), { target: { value: "Labour Officer" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(await screen.findByText("lookback_days must be at least detect_days")).toBeInTheDocument();
    expect(onSetupChanged).not.toHaveBeenCalled();
  });

  it("read-only without edit access", async () => {
    renderTab(false);
    expect(await screen.findByLabelText("Detect after")).toHaveAttribute("readonly");
    expect(screen.getByText(/View only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save settings/ })).not.toBeInTheDocument();
  });
});
