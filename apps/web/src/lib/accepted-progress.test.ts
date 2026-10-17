import {describe,expect,it} from "vitest";
import {highestAcceptedProgressByDocument,type AcceptedProgressRevision} from "./accepted-progress";

function revision(overrides:Partial<AcceptedProgressRevision>={}):AcceptedProgressRevision{
  return {id:"a",document_id:"document",issue_status:"Issued for Review (IFR)",state:"ready",control_status:"accepted",
    created_at:"2026-10-01T12:00:00Z",reviewed_at:"2026-10-02T12:00:00Z",overridden_by_revision_id:null,...overrides};
}

describe("highestAcceptedProgressByDocument",()=>{
  it("retains accepted FEED IFD progress when a later IFA or IFR was accepted",()=>{
    const ifd=revision({id:"ifd",issue_status:"Issued for Design (IFD)"});
    const laterIfa=revision({id:"ifa",issue_status:"Issued for Approval (IFA)",created_at:"2026-10-03T12:00:00Z",reviewed_at:"2026-10-04T12:00:00Z"});
    const laterIfr=revision({id:"ifr",created_at:"2026-10-05T12:00:00Z",reviewed_at:"2026-10-06T12:00:00Z"});
    expect(highestAcceptedProgressByDocument([laterIfr,laterIfa,ifd],"feed").get("document")).toBe(ifd);
    expect(highestAcceptedProgressByDocument([ifd,laterIfa,laterIfr],"feed").get("document")).toBe(ifd);
  });

  it.each(["pending_upload","processing","quarantined","failed","cancelled"])("does not credit an accepted but %s terminal revision",state=>{
    const ifr=revision();
    const unsafe=revision({id:"unsafe",issue_status:"Issued for Design (IFD)",state});
    expect(highestAcceptedProgressByDocument([unsafe,ifr],"feed").get("document")).toBe(ifr);
  });

  it.each(["submitted","returned","cancelled"])("does not credit a %s terminal revision",control_status=>{
    const ifr=revision();
    expect(highestAcceptedProgressByDocument([revision({issue_status:"Issued for Design (IFD)",control_status}),ifr],"feed").get("document")).toBe(ifr);
  });

  it("excludes overridden accepted milestones but keeps nonoverridden superseded accepted history",()=>{
    const superseded=revision({id:"ifa",issue_status:"Issued for Approval (IFA)",state:"superseded"});
    const overridden=revision({id:"ifd",issue_status:"Issued for Design (IFD)",overridden_by_revision_id:"replacement"});
    expect(highestAcceptedProgressByDocument([overridden,superseded],"feed").get("document")).toBe(superseded);
  });

  it("ranks by the configured project stage rather than revision code or input position",()=>{
    const ifa=revision({id:"ifa",issue_status:"Issued for Approval (IFA)",reviewed_at:"2026-10-04T12:00:00Z"});
    const ifd=revision({id:"ifd",issue_status:"Issued for Design (IFD)",reviewed_at:"2026-10-03T12:00:00Z"});
    expect(highestAcceptedProgressByDocument([ifa,ifd],"concept").get("document")).toBe(ifa);
    expect(highestAcceptedProgressByDocument([ifa,ifd],"feed").get("document")).toBe(ifd);
    expect(highestAcceptedProgressByDocument([ifa,ifd],"ded").get("document")).toBe(ifd);
    const ifc=revision({id:"ifc",issue_status:"Issued for Construction (IFC)"});
    expect(highestAcceptedProgressByDocument([ifd,ifc],"ded").get("document")).toBe(ifc);
  });

  it("breaks credit ties by review time, then creation time, then stable identity",()=>{
    const reviewed=revision({id:"b",reviewed_at:"2026-10-03T12:00:00Z"});
    expect(highestAcceptedProgressByDocument([revision({id:"z"}),reviewed],"feed").get("document")).toBe(reviewed);
    const created=revision({id:"c",created_at:"2026-10-02T12:00:00Z",reviewed_at:"2026-10-03T12:00:00Z"});
    expect(highestAcceptedProgressByDocument([created,reviewed],"feed").get("document")).toBe(created);
    const highestId=revision({id:"z",created_at:created.created_at,reviewed_at:created.reviewed_at});
    expect(highestAcceptedProgressByDocument([highestId,created],"feed").get("document")).toBe(highestId);
    expect(highestAcceptedProgressByDocument([created,highestId],"feed").get("document")).toBe(highestId);
  });

  it("uses creation time when no review timestamp exists",()=>{
    const later=revision({id:"later",created_at:"2026-10-04T12:00:00Z",reviewed_at:null});
    expect(highestAcceptedProgressByDocument([revision(),later],"feed").get("document")).toBe(later);
  });

  it("keeps documents separate and does not change input rows or their chronological order",()=>{
    const rows=Object.freeze([
      Object.freeze(revision({id:"later",issue_status:"Issued for Approval (IFA)",created_at:"2026-10-05T12:00:00Z"})),
      Object.freeze(revision({id:"other",document_id:"other",issue_status:"Issued for Construction (IFC)"})),
      Object.freeze(revision({id:"earlier",issue_status:"Issued for Design (IFD)"})),
    ]);
    const before=JSON.stringify(rows);
    const accepted=highestAcceptedProgressByDocument(rows,"feed");
    expect(accepted.get("document")?.id).toBe("earlier");
    expect(accepted.get("other")?.id).toBe("other");
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("returns no earned milestone when no eligible acceptance exists",()=>{
    expect(highestAcceptedProgressByDocument([],"feed").size).toBe(0);
    expect(highestAcceptedProgressByDocument([revision({control_status:"returned"})],"feed").size).toBe(0);
  });
});
