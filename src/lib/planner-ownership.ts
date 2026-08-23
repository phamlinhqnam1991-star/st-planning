export const PLANNER_1_OPERATIONS=[
 "CMSA","CHEMMILL","CPBILP","CPBILP-A","RWK","V_A-SHPN","MANUALSP","CLASP",
 "BSAUNSLD","TSAUNSLD","BSASLD","TSASLD","CCNV-IM","CCNV-IA","V_PASS/BRTG"
] as const;

export const PLANNER_2_OPERATIONS=[
 "FMSKG-CM","SIPC","SI-SEAL","STRIP","HE-BAKE after plating",
 "HE-BAKE before blasting","A-DBLST","M-DBLST","PLA-ZiNi","HE-BAKE","PLA-CC",
 "PRIMER","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2","ANTI-ABRASION",
 "PAINT MARKING","VARNISH"
] as const;

const P1=new Set(PLANNER_1_OPERATIONS.map(x=>x.toUpperCase()));
const P2=new Set(PLANNER_2_OPERATIONS.map(x=>x.toUpperCase()));

export function plannerForOperation(operation:unknown):"1"|"2"|null{
 const op=String(operation??"").trim().toUpperCase();
 if(P1.has(op))return "1";
 if(P2.has(op))return "2";
 return null;
}
