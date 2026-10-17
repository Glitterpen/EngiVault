import {describe,expect,it,vi} from "vitest";
import {formatReportDate,formatReportTimestamp} from "./report-display-date";

describe("controlled report date display",()=>{
  it("keeps calendar dates consistent with the rest of the project workspace",()=>{
    expect(formatReportDate("2026-09-07")).toBe("07 Sept 2026");
    expect(formatReportDate("2026-10-09")).toBe("09 Oct 2026");
    expect(formatReportDate("2028-02-29")).toBe("29 Feb 2028");
    expect(formatReportDate(null)).toBe("Not planned");
    expect(formatReportDate("not-a-date")).toBe("Not planned");
  });
  it("shows an explicit UTC timestamp, including midnight and offset day boundaries",()=>{
    expect(formatReportTimestamp("2026-10-16T00:00:00Z")).toBe("16 Oct 2026, 00:00 UTC");
    expect(formatReportTimestamp("2026-10-16T00:30:00+01:00")).toBe("15 Oct 2026, 23:30 UTC");
    expect(formatReportTimestamp("invalid")).toBe("Unavailable");
  });
  it("does not consult host locale or local timezone methods",()=>{
    const localDate=vi.spyOn(Date.prototype,"toLocaleDateString").mockReturnValue("host date");
    const localTime=vi.spyOn(Date.prototype,"toLocaleString").mockReturnValue("host timestamp");
    try{
      expect(formatReportDate("2026-10-15")).toBe("15 Oct 2026");
      expect(formatReportTimestamp("2026-10-15T23:30:00Z")).toBe("15 Oct 2026, 23:30 UTC");
      expect(localDate).not.toHaveBeenCalled();
      expect(localTime).not.toHaveBeenCalled();
    }finally{localDate.mockRestore();localTime.mockRestore();}
  });
});
