/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SearchableSelect, SearchableMultiSelect } from "@/components/ui/SearchableSelect";

type Branch = { branch_id: number; branch_name: string };

const branches: Branch[] = [
  { branch_id: 1, branch_name: "Kolkata Factory" },
  { branch_id: 2, branch_name: "Howrah Depot" },
  { branch_id: 3, branch_name: "Mumbai Office" },
];

/** Opens the dropdown the way a click on the field does. */
function open(input: HTMLElement) {
  fireEvent.mouseDown(input);
  fireEvent.focus(input);
}

/** Types into the field, which is the behaviour under test. */
function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

/** Wrapper mirroring the mandated call-site pattern: form state holds the id, not the option. */
function BranchField({
  initial = null,
  onIdChange,
  disabled,
}: {
  initial?: number | null;
  onIdChange?: (id: number | null) => void;
  disabled?: boolean;
}) {
  const [branchId, setBranchId] = React.useState<number | null>(initial);
  return (
    <SearchableSelect<Branch>
      variant="outlined"
      label="Branch"
      disabled={disabled}
      options={branches}
      value={branches.find((b) => b.branch_id === branchId) ?? null}
      onChange={(opt) => {
        setBranchId(opt?.branch_id ?? null);
        onIdChange?.(opt?.branch_id ?? null);
      }}
      getOptionLabel={(b) => b.branch_name}
      isOptionEqualToValue={(a, b) => a.branch_id === b.branch_id}
    />
  );
}

describe("SearchableSelect", () => {
  it("lets the user type to filter the options", async () => {
    render(<BranchField />);
    const input = screen.getByRole("combobox", { name: /branch/i });

    open(input);
    await waitFor(() => expect(screen.getByText("Kolkata Factory")).toBeInTheDocument());
    expect(screen.getByText("Mumbai Office")).toBeInTheDocument();

    type(input, "how");

    await waitFor(() => expect(screen.getByText("Howrah Depot")).toBeInTheDocument());
    expect(screen.queryByText("Kolkata Factory")).not.toBeInTheDocument();
    expect(screen.queryByText("Mumbai Office")).not.toBeInTheDocument();
  });

  it("reports the primitive id back to form state, not the option object", async () => {
    const onIdChange = vi.fn();
    render(<BranchField onIdChange={onIdChange} />);
    const input = screen.getByRole("combobox", { name: /branch/i });

    open(input);
    type(input, "mumbai");
    fireEvent.click(await screen.findByText("Mumbai Office"));

    expect(onIdChange).toHaveBeenCalledWith(3);
    await waitFor(() => expect(input).toHaveValue("Mumbai Office"));
  });

  it("renders the label of a preselected id", () => {
    render(<BranchField initial={2} />);
    expect(screen.getByRole("combobox", { name: /branch/i })).toHaveValue("Howrah Depot");
  });

  it("clears back to null", () => {
    const onIdChange = vi.fn();
    render(<BranchField initial={1} onIdChange={onIdChange} />);

    fireEvent.click(screen.getByTitle("Clear"));

    expect(onIdChange).toHaveBeenCalledWith(null);
  });

  it("expresses read-only as disabled, never by blocking typing", () => {
    render(<BranchField initial={1} disabled />);
    const input = screen.getByRole("combobox", { name: /branch/i });

    expect(input).toBeDisabled();
    // Crucially NOT readOnly — the standard forbids blocking typing to express read-only.
    expect(input).not.toHaveAttribute("readonly");
  });

  it("caps the rendered option list so huge master lists stay responsive", async () => {
    const many: Branch[] = Array.from({ length: 5000 }, (_, i) => ({
      branch_id: i + 1,
      branch_name: `Branch ${i + 1}`,
    }));

    render(
      <SearchableSelect<Branch>
        variant="outlined"
        label="Branch"
        options={many}
        value={null}
        onChange={() => {}}
        getOptionLabel={(b) => b.branch_name}
        isOptionEqualToValue={(a, b) => a.branch_id === b.branch_id}
      />,
    );

    open(screen.getByRole("combobox", { name: /branch/i }));

    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(200);
  });
});

describe("SearchableMultiSelect", () => {
  function MultiField({ onChange }: { onChange: (next: Branch[]) => void }) {
    const [value, setValue] = React.useState<Branch[]>([]);
    return (
      <SearchableMultiSelect<Branch>
        variant="outlined"
        label="Branches"
        options={branches}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        getOptionLabel={(b) => b.branch_name}
        isOptionEqualToValue={(a, b) => a.branch_id === b.branch_id}
      />
    );
  }

  it("accumulates selections without reopening the menu", async () => {
    const onChange = vi.fn();
    render(<MultiField onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: /branches/i });

    open(input);
    fireEvent.click(await screen.findByText("Kolkata Factory"));
    // Menu stays open (disableCloseOnSelect), so the second pick needs no reopen.
    fireEvent.click(await screen.findByText("Mumbai Office"));

    const last = onChange.mock.calls.at(-1)?.[0] as Branch[];
    expect(last.map((b) => b.branch_id)).toEqual([1, 3]);
  });

  it("filters by typed text", async () => {
    render(
      <SearchableMultiSelect<Branch>
        variant="outlined"
        label="Branches"
        options={branches}
        value={[]}
        onChange={() => {}}
        getOptionLabel={(b) => b.branch_name}
        isOptionEqualToValue={(a, b) => a.branch_id === b.branch_id}
      />,
    );
    const input = screen.getByRole("combobox", { name: /branches/i });

    open(input);
    type(input, "depot");

    await waitFor(() => expect(screen.getByText("Howrah Depot")).toBeInTheDocument());
    expect(screen.queryByText("Kolkata Factory")).not.toBeInTheDocument();
  });
});
