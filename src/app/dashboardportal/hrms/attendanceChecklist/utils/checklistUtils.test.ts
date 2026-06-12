import { describe, expect, it } from "vitest";
import { buildAttendanceRegisterQuery } from "@/utils/hrmsService";

describe("buildAttendanceRegisterQuery", () => {
  it("always includes from_date and to_date", () => {
    const qs = buildAttendanceRegisterQuery({
      from_date: "2026-06-01",
      to_date: "2026-06-12",
    });
    expect(qs).toBe("from_date=2026-06-01&to_date=2026-06-12");
  });

  it("includes optional filters only when set, and encodes values", () => {
    const qs = buildAttendanceRegisterQuery({
      from_date: "2026-06-01",
      to_date: "2026-06-12",
      branch_id: 4,
      department_id: "",
      designation_id: undefined,
      shift_name: "A Spell",
      att_type: "R",
      emp_code: "",
      emp_name: "Ravi Kumar",
    });
    const params = new URLSearchParams(qs);
    expect(params.get("branch_id")).toBe("4");
    expect(params.get("shift_name")).toBe("A Spell");
    expect(params.get("att_type")).toBe("R");
    expect(params.get("emp_name")).toBe("Ravi Kumar");
    expect(params.has("department_id")).toBe(false);
    expect(params.has("designation_id")).toBe(false);
    expect(params.has("emp_code")).toBe(false);
  });
});
