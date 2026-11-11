// Constants and reference tables used across the page.
import { mkey } from "./utils.js";

// ---- time range ----
export const START = new Date(2000, 0, 1);   // earlier years are sparse in the ProPublica release
export const END = new Date(2019, 11, 1);
export const YEARS = 20;
export const K0 = mkey(START), K1 = mkey(END);

// ---- thresholds ----
export const MIN_N = 100;       // allegations needed before a precinct's substantiation rate is shown
export const MIN_POP = 20000;   // residents needed before a per-resident rate is shown (excludes Central Park)

// ---- categories ----
export const FADO = ["Abuse of Authority", "Force", "Discourtesy", "Offensive Language"];
export const FADO_LABEL = {
  "Abuse of Authority": "Abuse of authority", "Force": "Force",
  "Discourtesy": "Discourtesy", "Offensive Language": "Offensive language",
};
export const OUTCOMES = [
  { key: "Substantiated", color: "--sub" },
  { key: "Exonerated", color: "--exon" },
  { key: "Unsubstantiated", color: "--unsub" },
];

// ---- geography ----
export const BORO = p => p <= 34 ? "Manhattan" : p <= 52 ? "Bronx" : p <= 94 ? "Brooklyn" : p <= 115 ? "Queens" : "Staten Island";

// Short neighborhood name for every precinct (the main neighborhood each covers; many span several).
export const HOOD = {
  // Manhattan
  1: "Lower Manhattan", 5: "Chinatown", 6: "West Village", 7: "Lower East Side", 9: "East Village", 10: "Chelsea",
  13: "Gramercy", 14: "Midtown South", 17: "Midtown East", 18: "Midtown North", 19: "Upper East Side", 20: "Upper West Side",
  22: "Central Park", 23: "East Harlem", 24: "Manhattan Valley", 25: "East Harlem North", 26: "Morningside Heights",
  28: "Central Harlem", 30: "Hamilton Heights", 32: "Harlem", 33: "Washington Heights", 34: "Inwood",
  // Bronx
  40: "Mott Haven", 41: "Hunts Point", 42: "Morrisania", 43: "Soundview", 44: "Grand Concourse", 45: "Throgs Neck",
  46: "Fordham", 47: "Wakefield", 48: "Belmont", 49: "Morris Park", 50: "Riverdale", 52: "Bedford Park",
  // Brooklyn
  60: "Coney Island", 61: "Sheepshead Bay", 62: "Bensonhurst", 63: "Flatlands", 66: "Borough Park", 67: "East Flatbush",
  68: "Bay Ridge", 69: "Canarsie", 70: "Midwood", 71: "Prospect Lefferts", 72: "Sunset Park", 73: "Brownsville",
  75: "East New York", 76: "Red Hook", 77: "Crown Heights", 78: "Park Slope", 79: "Bed-Stuy", 81: "Ocean Hill",
  83: "Bushwick", 84: "Downtown Brooklyn", 88: "Fort Greene", 90: "Williamsburg", 94: "Greenpoint",
  // Queens
  100: "Rockaways", 101: "Far Rockaway", 102: "Richmond Hill", 103: "Jamaica", 104: "Ridgewood", 105: "Queens Village",
  106: "Ozone Park", 107: "Fresh Meadows", 108: "Long Island City", 109: "Flushing", 110: "Elmhurst", 111: "Bayside",
  112: "Forest Hills", 113: "South Jamaica", 114: "Astoria", 115: "Jackson Heights",
  // Staten Island
  120: "St. George", 121: "Port Richmond", 122: "New Dorp", 123: "Tottenville",
};
export const pname = p => HOOD[p] ? `Precinct ${p} · ${HOOD[p]}` : `Precinct ${p}`;

// Commercial precincts whose daytime population dwarfs residents: per-resident rates are flagged as inflated.
export const COMMERCIAL = new Set([1, 14, 18]);

// ---- timeline context (facts about policing, not claims drawn from this dataset) ----
export const EVENTS = [
  { date: new Date(2011, 0, 1), span: 12, short: "Stop-and-frisk peaks", when: "2011",
    text: "NYPD stop-and-frisk peaks at about 686,000 stops in one year, mostly of Black and Latino New Yorkers." },
  { date: new Date(2013, 7, 1), span: 10, short: "Floyd ruling", when: "Aug 2013",
    text: "In <i>Floyd v. City of New York</i>, a federal judge rules the NYPD's stop-and-frisk practices unconstitutional." },
  { date: new Date(2014, 6, 1), span: 12, short: "Eric Garner", p: 120, when: "July 2014",
    text: "Eric Garner dies after an officer puts him in a chokehold on Staten Island, in the 120th Precinct (outlined)." },
].map(e => ({ ...e, k: mkey(e.date) }));
