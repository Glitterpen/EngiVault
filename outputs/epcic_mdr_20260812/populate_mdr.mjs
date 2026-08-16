import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/ahmed/Downloads/EngiCite-MDR-Import-Template (3).xlsx";
const outputDir = "C:/Users/ahmed/Documents/EngiVault/outputs/epcic_mdr_20260812";
const outputPath = `${outputDir}/EngiCite-MDR-EPCIC-HMK-26-01-12-Week-Schedule.xlsx`;
const prefix = "HMK-26-01";

const phaseDates = [
  "2026-07-29", "2026-08-05", "2026-08-12", "2026-08-19",
  "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16",
  "2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14",
  "2026-10-18", "2026-10-21",
];

const toDate = (iso) => new Date(`${iso}T00:00:00.000Z`);
const projectStart = toDate("2026-07-29");
const projectEnd = toDate("2026-10-21");
const addDays = (iso, days) => {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date > projectEnd ? new Date(projectEnd) : date;
};

const rows = [];
const add = ({ discipline, number, title, type, phase, status, area = "General", system = "Project-wide", workPackage, weight = 1 }) => {
  const submission = phaseDates[phase];
  rows.push([
    `${prefix}-${number}`,
    title,
    discipline,
    type,
    toDate(submission),
    addDays(submission, 7),
    status,
    `EPCIC Contractor – ${discipline} Engineering`,
    weight,
    area,
    system,
    workPackage,
  ]);
};

const processWp = "WP-01 Process Engineering";
add({discipline:"Process",number:"PRO-BAS-0001",title:"Process Design Basis",type:"Report",phase:0,status:"Issued for Approval (IFA)",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-CRI-0001",title:"Process Design Criteria",type:"Specification",phase:0,status:"Issued for Approval (IFA)",workPackage:processWp});
add({discipline:"Process",number:"PRO-PFD-0001",title:"Process Flow Diagram – Inlet Manifold and Separation",type:"Drawing",phase:1,status:"Issued for Design (IFD)",area:"Process Area",system:"Inlet & Separation",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PFD-0002",title:"Process Flow Diagram – Crude Oil Treatment and Export",type:"Drawing",phase:1,status:"Issued for Design (IFD)",area:"Process Area",system:"Oil Treatment & Export",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PFD-0003",title:"Process Flow Diagram – Produced Water Treatment",type:"Drawing",phase:1,status:"Issued for Design (IFD)",area:"Process Area",system:"Produced Water",workPackage:processWp});
add({discipline:"Process",number:"PRO-PFD-0004",title:"Process Flow Diagram – Utilities and Support Systems",type:"Drawing",phase:1,status:"Issued for Design (IFD)",area:"Utilities",system:"Utilities",workPackage:processWp});
add({discipline:"Process",number:"PRO-HMB-0001",title:"Heat and Material Balance",type:"Calculation",phase:1,status:"Issued for Approval (IFA)",area:"Process Area",system:"Project-wide",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-UBL-0001",title:"Utility Consumption and Balance",type:"Calculation",phase:2,status:"Issued for Approval (IFA)",area:"Utilities",system:"Utilities",workPackage:processWp});
add({discipline:"Process",number:"PRO-LST-0001",title:"Process Equipment List",type:"List",phase:1,status:"Issued for Approval (IFA)",workPackage:processWp});
add({discipline:"Process",number:"PRO-LST-0002",title:"Process Line List",type:"List",phase:2,status:"Approved for Construction (AFC)",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PID-0001",title:"P&ID – Inlet Manifold and Pig Receiver",type:"Drawing",phase:2,status:"Approved for Construction (AFC)",area:"Process Area",system:"Inlet & Separation",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PID-0002",title:"P&ID – Production Separators",type:"Drawing",phase:2,status:"Approved for Construction (AFC)",area:"Process Area",system:"Inlet & Separation",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PID-0003",title:"P&ID – Crude Oil Transfer and Export",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Export Area",system:"Oil Treatment & Export",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PID-0004",title:"P&ID – Produced Water Collection and Treatment",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Process Area",system:"Produced Water",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PID-0005",title:"P&ID – Fuel Gas System",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Utilities",system:"Fuel Gas",workPackage:processWp});
add({discipline:"Process",number:"PRO-PID-0006",title:"P&ID – Flare and Blowdown System",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Flare Area",system:"Flare & Blowdown",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PID-0007",title:"P&ID – Open and Closed Drain Systems",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Process Area",system:"Drain Systems",workPackage:processWp});
add({discipline:"Process",number:"PRO-PID-0008",title:"P&ID – Chemical Injection Systems",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Process Area",system:"Chemical Injection",workPackage:processWp});
add({discipline:"Process",number:"PRO-DAT-0001",title:"Process Datasheet – Production Separators",type:"Datasheet",phase:2,status:"Issued for Procurement (IFP)",area:"Process Area",system:"Inlet & Separation",workPackage:"WP-02 Procurement"});
add({discipline:"Process",number:"PRO-DAT-0002",title:"Process Datasheet – Crude Oil Transfer Pumps",type:"Datasheet",phase:2,status:"Issued for Procurement (IFP)",area:"Export Area",system:"Oil Treatment & Export",workPackage:"WP-02 Procurement"});
add({discipline:"Process",number:"PRO-DAT-0003",title:"Process Datasheet – Produced Water Pumps",type:"Datasheet",phase:3,status:"Issued for Procurement (IFP)",area:"Process Area",system:"Produced Water",workPackage:"WP-02 Procurement"});
add({discipline:"Process",number:"PRO-DAT-0004",title:"Process Datasheet – Storage and Drain Vessels",type:"Datasheet",phase:3,status:"Issued for Procurement (IFP)",area:"Process Area",system:"Drain Systems",workPackage:"WP-02 Procurement"});
add({discipline:"Process",number:"PRO-CAL-0001",title:"Relief, Blowdown and Flare Load Study",type:"Calculation",phase:3,status:"Issued for Approval (IFA)",area:"Flare Area",system:"Flare & Blowdown",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-CAL-0002",title:"Process Hydraulic Calculations",type:"Calculation",phase:4,status:"Issued for Approval (IFA)",area:"Process Area",system:"Project-wide",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-PHI-0001",title:"Process Control and Operating Philosophy",type:"Philosophy",phase:3,status:"Issued for Approval (IFA)",workPackage:processWp});
add({discipline:"Process",number:"PRO-PHI-0002",title:"Safeguarding, Shutdown and Depressurisation Philosophy",type:"Philosophy",phase:3,status:"Issued for Safety Review",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-RPT-0001",title:"HAZOP Review Report",type:"Report",phase:5,status:"Issued for HAZOP Review",workPackage:processWp,weight:2});
add({discipline:"Process",number:"PRO-RPT-0002",title:"HAZOP Action Close-out Report",type:"Report",phase:6,status:"Approved / Final",workPackage:processWp});
add({discipline:"Process",number:"PRO-MAN-0001",title:"Process Operating Manual",type:"Manual",phase:10,status:"Issued for Operations",workPackage:"WP-07 Commissioning & Handover",weight:2});
add({discipline:"Process",number:"PRO-MAN-0002",title:"Process Start-up and Shutdown Manual",type:"Manual",phase:10,status:"Issued for Start-up",workPackage:"WP-07 Commissioning & Handover"});

const pipingWp = "WP-04 Piping Engineering & Construction";
add({discipline:"Piping",number:"PIP-BAS-0001",title:"Piping Design Basis",type:"Report",phase:0,status:"Issued for Approval (IFA)",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-SPE-0001",title:"Piping Materials Specification",type:"Specification",phase:1,status:"Issued for Approval (IFA)",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-SPE-0002",title:"Piping Material Class Specification",type:"Specification",phase:1,status:"Approved for Construction (AFC)",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-SPE-0003",title:"Valve Specification",type:"Specification",phase:2,status:"Issued for Procurement (IFP)",workPackage:"WP-02 Procurement"});
add({discipline:"Piping",number:"PIP-SPE-0004",title:"Piping Insulation Specification",type:"Specification",phase:2,status:"Approved for Construction (AFC)",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-SPE-0005",title:"Piping Painting and Protective Coating Specification",type:"Specification",phase:2,status:"Approved for Construction (AFC)",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-LST-0001",title:"Piping Line List",type:"List",phase:2,status:"Approved for Construction (AFC)",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-LST-0002",title:"Valve List",type:"List",phase:3,status:"Issued for Procurement (IFP)",workPackage:"WP-02 Procurement"});
add({discipline:"Piping",number:"PIP-LST-0003",title:"Piping Specialty Items List",type:"List",phase:3,status:"Issued for Procurement (IFP)",workPackage:"WP-02 Procurement"});
add({discipline:"Piping",number:"PIP-DWG-0001",title:"Overall Equipment and Piping Plot Plan",type:"Drawing",phase:1,status:"Issued for Approval (IFA)",area:"Site-wide",system:"Project-wide",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-DWG-0002",title:"Process Area Piping General Arrangement",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Process Area",system:"Inlet & Separation",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-DWG-0003",title:"Utilities Area Piping General Arrangement",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Utilities",system:"Utilities",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-DWG-0004",title:"Main Pipe Rack Piping Layout",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Process Area",system:"Pipe Rack",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-DWG-0005",title:"Underground Piping and Drainage Layout",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Underground Services",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-SCH-0001",title:"Piping Tie-in Schedule",type:"Schedule",phase:4,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Tie-ins",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-CAL-0001",title:"Pipe Stress Calculation – Inlet and Export Lines",type:"Calculation",phase:5,status:"Issued for Approval (IFA)",area:"Process Area",system:"Inlet & Export",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-CAL-0002",title:"Pipe Stress Calculation – Pump Suction and Discharge",type:"Calculation",phase:5,status:"Issued for Approval (IFA)",area:"Process Area",system:"Oil Transfer",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-CAL-0003",title:"Pipe Stress Calculation – Flare and Blowdown Headers",type:"Calculation",phase:5,status:"Issued for Approval (IFA)",area:"Flare Area",system:"Flare & Blowdown",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-CAL-0004",title:"Pipe Stress Calculation – Utility Headers",type:"Calculation",phase:6,status:"Issued for Approval (IFA)",area:"Utilities",system:"Utilities",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-RPT-0001",title:"Piping Flexibility and Stress Analysis Summary",type:"Report",phase:6,status:"Approved / Final",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-DWG-0006",title:"Standard Pipe Support Details",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Pipe Supports",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-DWG-0007",title:"Critical and Special Pipe Support Drawings",type:"Drawing",phase:6,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Pipe Supports",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-ISO-0001",title:"Piping Isometrics – Inlet Manifold",type:"Drawing",phase:7,status:"Approved for Construction (AFC)",area:"Process Area",system:"Inlet",workPackage:pipingWp,weight:3});
add({discipline:"Piping",number:"PIP-ISO-0002",title:"Piping Isometrics – Separation System",type:"Drawing",phase:7,status:"Approved for Construction (AFC)",area:"Process Area",system:"Separation",workPackage:pipingWp,weight:3});
add({discipline:"Piping",number:"PIP-ISO-0003",title:"Piping Isometrics – Crude Oil Export",type:"Drawing",phase:7,status:"Approved for Construction (AFC)",area:"Export Area",system:"Oil Export",workPackage:pipingWp,weight:3});
add({discipline:"Piping",number:"PIP-ISO-0004",title:"Piping Isometrics – Produced Water",type:"Drawing",phase:8,status:"Approved for Construction (AFC)",area:"Process Area",system:"Produced Water",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-ISO-0005",title:"Piping Isometrics – Fuel Gas",type:"Drawing",phase:8,status:"Approved for Construction (AFC)",area:"Utilities",system:"Fuel Gas",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-ISO-0006",title:"Piping Isometrics – Flare and Blowdown",type:"Drawing",phase:8,status:"Approved for Construction (AFC)",area:"Flare Area",system:"Flare & Blowdown",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-ISO-0007",title:"Piping Isometrics – Open and Closed Drains",type:"Drawing",phase:8,status:"Approved for Construction (AFC)",area:"Process Area",system:"Drain Systems",workPackage:pipingWp,weight:2});
add({discipline:"Piping",number:"PIP-ISO-0008",title:"Piping Isometrics – Chemical Injection",type:"Drawing",phase:9,status:"Approved for Construction (AFC)",area:"Process Area",system:"Chemical Injection",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-MTO-0001",title:"Bulk Piping Material Take-Off",type:"Material Take-Off",phase:6,status:"Issued for Procurement (IFP)",workPackage:"WP-02 Procurement",weight:2});
add({discipline:"Piping",number:"PIP-PRC-0001",title:"Piping Fabrication and Installation Procedure",type:"Procedure",phase:7,status:"Issued for Construction (IFC)",workPackage:pipingWp});
add({discipline:"Piping",number:"PIP-PRC-0002",title:"Piping Pressure Testing, Flushing and Reinstatement Procedure",type:"Procedure",phase:9,status:"Issued for Commissioning",workPackage:"WP-07 Commissioning & Handover"});
add({discipline:"Piping",number:"PIP-PRC-0003",title:"Piping Redline and As-Built Preparation Procedure",type:"Procedure",phase:12,status:"Redline / Marked-up As-Built",workPackage:"WP-07 Commissioning & Handover"});

const structuralWp = "WP-03 Civil & Structural";
add({discipline:"Structural",number:"STR-BAS-0001",title:"Structural Design Basis",type:"Report",phase:0,status:"Issued for Approval (IFA)",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-CRI-0001",title:"Civil and Structural Design Criteria",type:"Specification",phase:0,status:"Issued for Approval (IFA)",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-RPT-0001",title:"Topographical Survey Report",type:"Report",phase:1,status:"Approved / Final",area:"Site-wide",system:"Site Development",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-RPT-0002",title:"Geotechnical Investigation Report",type:"Report",phase:1,status:"Approved / Final",area:"Site-wide",system:"Foundations",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-CAL-0001",title:"Site Grading and Drainage Design Calculation",type:"Calculation",phase:2,status:"Issued for Approval (IFA)",area:"Site-wide",system:"Site Development",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-DWG-0001",title:"Site Grading, Roads and Drainage Layout",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Site Development",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0002",title:"Overall Foundation Key Plan",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Foundations",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-CAL-0002",title:"Production Separator Foundation Calculation",type:"Calculation",phase:3,status:"Issued for Approval (IFA)",area:"Process Area",system:"Separation",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0003",title:"Production Separator Foundation GA and Details",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Process Area",system:"Separation",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-CAL-0003",title:"Crude Oil Transfer Pump Foundation Calculation",type:"Calculation",phase:3,status:"Issued for Approval (IFA)",area:"Export Area",system:"Oil Export",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-DWG-0004",title:"Pump Foundation GA and Details",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Process Area",system:"Pumps",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-CAL-0004",title:"Storage and Drain Vessel Foundation Calculation",type:"Calculation",phase:4,status:"Issued for Approval (IFA)",area:"Process Area",system:"Storage & Drains",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-DWG-0005",title:"Storage and Drain Vessel Foundation Details",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Process Area",system:"Storage & Drains",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-CAL-0005",title:"Main Pipe Rack Structural Analysis and Design",type:"Calculation",phase:4,status:"Issued for Approval (IFA)",area:"Process Area",system:"Pipe Rack",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0006",title:"Main Pipe Rack Foundation Layout and Details",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Process Area",system:"Pipe Rack",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0007",title:"Main Pipe Rack Structural Steel GA",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Process Area",system:"Pipe Rack",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0008",title:"Main Pipe Rack Structural Steel Fabrication Details",type:"Drawing",phase:6,status:"Issued for Fabrication (IFF)",area:"Process Area",system:"Pipe Rack",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-CAL-0006",title:"Equipment Access Platforms Structural Calculation",type:"Calculation",phase:5,status:"Issued for Approval (IFA)",area:"Process Area",system:"Access Platforms",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-DWG-0009",title:"Equipment Access Platforms GA and Details",type:"Drawing",phase:6,status:"Issued for Fabrication (IFF)",area:"Process Area",system:"Access Platforms",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-CAL-0007",title:"Equipment Shelter Structural Calculation",type:"Calculation",phase:5,status:"Issued for Approval (IFA)",area:"Utilities",system:"Equipment Shelter",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-DWG-0010",title:"Equipment Shelter GA and Fabrication Details",type:"Drawing",phase:6,status:"Issued for Fabrication (IFF)",area:"Utilities",system:"Equipment Shelter",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-CAL-0008",title:"Substation and Control Building Structural Calculation",type:"Calculation",phase:4,status:"Issued for Approval (IFA)",area:"Buildings",system:"Electrical Buildings",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0011",title:"Substation and Control Building Foundation and Frame Details",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Buildings",system:"Electrical Buildings",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-CAL-0009",title:"Flare Stack Foundation Calculation",type:"Calculation",phase:5,status:"Issued for Approval (IFA)",area:"Flare Area",system:"Flare & Blowdown",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0012",title:"Flare Stack and Knockout Drum Foundation Details",type:"Drawing",phase:6,status:"Approved for Construction (AFC)",area:"Flare Area",system:"Flare & Blowdown",workPackage:structuralWp,weight:2});
add({discipline:"Structural",number:"STR-DWG-0013",title:"Cable Tray and Electrical Equipment Support Foundations",type:"Drawing",phase:6,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Electrical Supports",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-SCH-0001",title:"Foundation, Anchor Bolt and Reinforcement Schedule",type:"Schedule",phase:6,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Foundations",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-MTO-0001",title:"Concrete and Reinforcement Material Take-Off",type:"Material Take-Off",phase:5,status:"Issued for Procurement (IFP)",workPackage:"WP-02 Procurement"});
add({discipline:"Structural",number:"STR-MTO-0002",title:"Structural Steel Material Take-Off",type:"Material Take-Off",phase:6,status:"Issued for Procurement (IFP)",workPackage:"WP-02 Procurement"});
add({discipline:"Structural",number:"STR-PRC-0001",title:"Structural Steel Fabrication and Erection Procedure",type:"Procedure",phase:7,status:"Issued for Construction (IFC)",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-PRC-0002",title:"Concrete Works and Foundation Construction Procedure",type:"Procedure",phase:7,status:"Issued for Construction (IFC)",workPackage:structuralWp});
add({discipline:"Structural",number:"STR-DWG-0014",title:"Civil and Structural As-Built Drawings",type:"Drawing",phase:13,status:"Final As-Built",area:"Site-wide",system:"Project-wide",workPackage:"WP-07 Commissioning & Handover",weight:2});

const electricalWp = "WP-05 Electrical Engineering & Construction";
add({discipline:"Electrical",number:"ELE-BAS-0001",title:"Electrical Design Basis",type:"Report",phase:0,status:"Issued for Approval (IFA)",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-PHI-0001",title:"Electrical Generation and Distribution Philosophy",type:"Philosophy",phase:0,status:"Issued for Approval (IFA)",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-LST-0001",title:"Electrical Load List",type:"List",phase:1,status:"Issued for Approval (IFA)",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-LST-0002",title:"Electrical Consumers and Equipment List",type:"List",phase:1,status:"Issued for Approval (IFA)",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-SLD-0001",title:"Medium Voltage Single Line Diagram",type:"Drawing",phase:2,status:"Approved for Construction (AFC)",area:"Electrical Substation",system:"MV Distribution",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-SLD-0002",title:"Low Voltage Single Line Diagram",type:"Drawing",phase:2,status:"Approved for Construction (AFC)",area:"Electrical Substation",system:"LV Distribution",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-SLD-0003",title:"Essential and Emergency Power Single Line Diagram",type:"Drawing",phase:3,status:"Approved for Construction (AFC)",area:"Electrical Substation",system:"Emergency Power",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-CAL-0001",title:"Electrical Load Flow Study",type:"Calculation",phase:2,status:"Issued for Approval (IFA)",system:"Power System",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-CAL-0002",title:"Short Circuit Study",type:"Calculation",phase:2,status:"Issued for Approval (IFA)",system:"Power System",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-CAL-0003",title:"Motor Starting Study",type:"Calculation",phase:3,status:"Issued for Approval (IFA)",system:"Power System",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-CAL-0004",title:"Protection Coordination and Relay Setting Study",type:"Calculation",phase:4,status:"Issued for Approval (IFA)",system:"Protection System",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-CAL-0005",title:"Earthing and Lightning Protection Calculation",type:"Calculation",phase:3,status:"Issued for Approval (IFA)",system:"Earthing & Lightning",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-DWG-0001",title:"Site Earthing and Lightning Protection Layout",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Earthing & Lightning",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-CAL-0006",title:"Lighting Level Calculation",type:"Calculation",phase:4,status:"Issued for Approval (IFA)",system:"Lighting",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-DWG-0002",title:"Process and Utilities Area Lighting Layout",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Process & Utilities",system:"Lighting",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-DWG-0003",title:"Buildings Lighting and Small Power Layout",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Buildings",system:"Lighting & Small Power",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-DWG-0004",title:"Hazardous Area Electrical Equipment Layout",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Process Area",system:"Hazardous Areas",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-DWG-0005",title:"Electrical Equipment Location Layout",type:"Drawing",phase:4,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Power Distribution",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-DWG-0006",title:"Underground Electrical Cable Routing Layout",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Cable Routing",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-DWG-0007",title:"Aboveground Cable Tray Routing Layout",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Cable Routing",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-SCH-0001",title:"Power and Control Cable Schedule",type:"Schedule",phase:5,status:"Approved for Construction (AFC)",system:"Cables",workPackage:electricalWp,weight:2});
add({discipline:"Electrical",number:"ELE-SCH-0002",title:"Cable Termination and Glanding Schedule",type:"Schedule",phase:6,status:"Approved for Construction (AFC)",system:"Cables",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-DWG-0008",title:"Typical Electrical Installation Details",type:"Drawing",phase:5,status:"Approved for Construction (AFC)",area:"Site-wide",system:"Electrical Installation",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-DAT-0001",title:"Medium Voltage Switchgear Datasheet",type:"Datasheet",phase:2,status:"Issued for Procurement (IFP)",area:"Electrical Substation",system:"MV Distribution",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-DAT-0002",title:"Low Voltage Switchgear and MCC Datasheet",type:"Datasheet",phase:2,status:"Issued for Procurement (IFP)",area:"Electrical Substation",system:"LV Distribution",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-DAT-0003",title:"Power Transformer Datasheet",type:"Datasheet",phase:2,status:"Issued for Procurement (IFP)",area:"Electrical Substation",system:"Power Transformers",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-DAT-0004",title:"UPS and Battery Charger Datasheet",type:"Datasheet",phase:3,status:"Issued for Procurement (IFP)",area:"Electrical Substation",system:"DC & UPS",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-DAT-0005",title:"Emergency Generator Datasheet",type:"Datasheet",phase:3,status:"Issued for Procurement (IFP)",area:"Utilities",system:"Emergency Power",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-SPE-0001",title:"Power and Control Cable Specification",type:"Specification",phase:3,status:"Issued for Procurement (IFP)",system:"Cables",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-SPE-0002",title:"Lighting Fixtures, Receptacles and Junction Boxes Specification",type:"Specification",phase:3,status:"Issued for Procurement (IFP)",system:"Lighting & Small Power",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-REQ-0001",title:"Requisition – MV and LV Switchgear and MCC",type:"Requisition",phase:3,status:"Issued for Purchase",area:"Electrical Substation",system:"Power Distribution",workPackage:"WP-02 Procurement",weight:2});
add({discipline:"Electrical",number:"ELE-REQ-0002",title:"Requisition – Power Transformers",type:"Requisition",phase:3,status:"Issued for Purchase",area:"Electrical Substation",system:"Power Transformers",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-REQ-0003",title:"Requisition – UPS and DC System",type:"Requisition",phase:4,status:"Issued for Purchase",area:"Electrical Substation",system:"DC & UPS",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-REQ-0004",title:"Requisition – Emergency Generator",type:"Requisition",phase:4,status:"Issued for Purchase",area:"Utilities",system:"Emergency Power",workPackage:"WP-02 Procurement"});
add({discipline:"Electrical",number:"ELE-REQ-0005",title:"Requisition – Bulk Cables, Trays and Earthing Materials",type:"Requisition",phase:5,status:"Issued for Purchase",area:"Site-wide",system:"Electrical Bulk",workPackage:"WP-02 Procurement",weight:2});
add({discipline:"Electrical",number:"ELE-MTO-0001",title:"Electrical Bulk Material Take-Off",type:"Material Take-Off",phase:5,status:"Issued for Procurement (IFP)",area:"Site-wide",system:"Electrical Bulk",workPackage:"WP-02 Procurement",weight:2});
add({discipline:"Electrical",number:"ELE-PRC-0001",title:"Electrical Equipment and Cable Installation Procedure",type:"Procedure",phase:7,status:"Issued for Construction (IFC)",workPackage:electricalWp});
add({discipline:"Electrical",number:"ELE-PRC-0002",title:"Electrical Testing, Energisation and Commissioning Procedure",type:"Procedure",phase:9,status:"Issued for Commissioning",workPackage:"WP-07 Commissioning & Handover",weight:2});
add({discipline:"Electrical",number:"ELE-MAN-0001",title:"Electrical Systems Operation and Maintenance Manual",type:"Manual",phase:11,status:"Issued for Operations",workPackage:"WP-07 Commissioning & Handover",weight:2});

const allowedDisciplines = new Set(["Process", "Piping", "Structural", "Electrical"]);
const allowedTypes = new Set(["Drawing", "Datasheet", "Specification", "Calculation", "Report", "Procedure", "Requisition", "Material Take-Off", "Schedule", "List", "Philosophy", "Manual"]);
const allowedStatuses = new Set([
  "Issued for Approval (IFA)", "Issued for Design (IFD)", "Approved for Construction (AFC)",
  "Issued for Procurement (IFP)", "Issued for Safety Review", "Issued for HAZOP Review",
  "Approved / Final", "Issued for Operations", "Issued for Start-up", "Issued for Fabrication (IFF)",
  "Issued for Construction (IFC)", "Issued for Commissioning", "Redline / Marked-up As-Built",
  "Final As-Built", "Issued for Purchase",
]);

const documentNumbers = new Set();
for (const row of rows) {
  if (documentNumbers.has(row[0])) throw new Error(`Duplicate document number: ${row[0]}`);
  documentNumbers.add(row[0]);
  if (!allowedDisciplines.has(row[2])) throw new Error(`Invalid discipline: ${row[2]}`);
  if (!allowedTypes.has(row[3])) throw new Error(`Invalid document type: ${row[3]}`);
  if (!allowedStatuses.has(row[6])) throw new Error(`Invalid issue status: ${row[6]}`);
  if (!(row[4] instanceof Date) || !(row[5] instanceof Date) || row[5] < row[4]) throw new Error(`Invalid dates for ${row[0]}`);
  if (row[4] < projectStart || row[5] > projectEnd) throw new Error(`Date outside 12-week project window for ${row[0]}`);
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("MDR Import");
const startRow = 5;
const endRow = startRow + rows.length - 1;
sheet.getRange(`A${startRow}:L${endRow}`).values = rows;
sheet.getRange(`E${startRow}:F${endRow}`).setNumberFormat("yyyy-mm-dd");
sheet.getRange(`A${startRow}:L${endRow}`).format.wrapText = true;

const instructions = workbook.worksheets.getItem("Instructions");
instructions.getRange("A1:A14").format.columnWidth = 24;
instructions.getRange("A11:B14").format.wrapText = true;
instructions.getRange("A11:B14").format.autofitRows();

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const counts = rows.reduce((result, row) => {
  result[row[2]] = (result[row[2]] ?? 0) + 1;
  return result;
}, {});
console.log(JSON.stringify({
  outputPath,
  rows: rows.length,
  counts,
  endRow,
  projectStart: projectStart.toISOString().slice(0, 10),
  projectEnd: projectEnd.toISOString().slice(0, 10),
  durationWeeks: 12,
}, null, 2));

const keyRange = await workbook.inspect({
  kind: "table",
  range: `MDR Import!A4:L${Math.min(endRow, 20)}`,
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 12,
  maxChars: 12000,
});
console.log(keyRange.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const disciplineRanges = [
  ["Process", 5, 34],
  ["Piping", 35, 68],
  ["Structural", 69, 100],
  ["Electrical", 101, endRow],
];
for (const [name, fromRow, toRow] of disciplineRanges) {
  const preview = await workbook.render({
    sheetName: "MDR Import",
    range: `A${fromRow === 5 ? 1 : fromRow}:L${toRow}`,
    scale: 1.25,
    format: "png",
  });
  await fs.writeFile(`${outputDir}/final-${name}.png`, new Uint8Array(await preview.arrayBuffer()));
}

for (const name of ["Instructions", "Allowed Values"]) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1.5, format: "png" });
  await fs.writeFile(`${outputDir}/final-${name.replace(/\s+/g, "-")}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const savedWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const savedTail = await savedWorkbook.inspect({
  kind: "table",
  range: `MDR Import!A136:L${endRow}`,
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 12,
  maxChars: 8000,
});
console.log("SAVED FILE TAIL CHECK");
console.log(savedTail.ndjson);

const savedErrors = await savedWorkbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "saved workbook formula error scan",
});
console.log(savedErrors.ndjson);
