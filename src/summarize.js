// A FHIR document Bundle as the view model the clinical views render: the
// patient, the sections with their items, what the document covers and what
// has to be checked before it is relied on. Ported from Provbana's summariser
// (provbana/app.py, summarize_bundle and detect_document).

import {
  isObj, isStr, list, text, lookup, ccDisplay, firstStr, squash, buildReferenceIndex,
  resolveReference, sectionNarrative, isoDay, dayNumber, EMPTY_REASON_LABELS,
} from "./datatypes.js";
import {
  ITEM_CATEGORIES, MEDICATION_ENDED, alertTargets, humanName, noteText, phone,
  referenceName, renderResource, setToday, shortLabel,
} from "./item.js";

/** The document types the viewer tells apart, most specific signals first. */
export const DOCUMENT_TYPES = [
  {
    id: "eps",
    label: "Patient summary",
    longLabel: "European Patient Summary",
    bundles: ["http://hl7.eu/fhir/eps/StructureDefinition/bundle-eu-eps"],
    loinc: ["60591-5"],
    entryProfiles: [],
    spec: "https://hl7.eu/fhir/eps/",
  },
  {
    id: "laboratory",
    label: "Laboratory report",
    longLabel: "Laboratory Report",
    bundles: ["http://hl7.eu/fhir/laboratory/StructureDefinition/Bundle-eu-lab"],
    loinc: ["11502-2"],
    entryProfiles: [],
    spec: "https://hl7.eu/fhir/laboratory/",
  },
  {
    id: "mpd",
    label: "Prescription and dispense",
    longLabel: "Medication Prescription and Dispense",
    bundles: [],
    loinc: [],
    entryProfiles: [
      "http://hl7.eu/fhir/mpd/StructureDefinition/MedicationRequest-eu-mpd",
      "http://hl7.eu/fhir/mpd/StructureDefinition/MedicationDispense-eu-mpd",
      "http://hl7.eu/fhir/mpd/StructureDefinition/Medication-eu-mpd",
    ],
    spec: "https://hl7.eu/fhir/mpd/",
  },
  {
    id: "imaging",
    label: "Imaging report",
    longLabel: "Imaging Report",
    bundles: [
      "http://hl7.eu/fhir/imaging/StructureDefinition/BundleReportEuImaging",
      "http://hl7.eu/fhir/imaging/StructureDefinition/BundleReportMinimalMetadataEuImaging",
    ],
    loinc: [],
    entryProfiles: [],
    spec: "https://hl7.eu/fhir/imaging/",
  },
  {
    id: "hdr",
    label: "Discharge report",
    longLabel: "Hospital Discharge Report",
    bundles: [
      "http://hl7.eu/fhir/hdr/StructureDefinition/bundle-eu-hdr",
      "http://hl7.eu/fhir/hdr/StructureDefinition/bundle-obl-eu-hdr",
    ],
    loinc: ["34105-7"],
    entryProfiles: [],
    spec: "https://hl7.eu/fhir/hdr/",
  },
];
const TYPE_BY_ID = Object.fromEntries(DOCUMENT_TYPES.map((doc) => [doc.id, doc]));
const PRIMARY_TYPE = TYPE_BY_ID.eps;

/** meta.profile as a list of strings, version suffix stripped: a claim may be
 * versioned ("...|1.0.0") and still means the same profile. */
function metaProfiles(resource) {
  const claimed = isObj(resource) && isObj(resource.meta) ? resource.meta.profile : null;
  return list(claimed).filter(isStr).map((c) => c.split("|")[0]);
}

/**
 * Which kind of document a Bundle is, as a DOCUMENT_TYPES entry.
 *
 * Ordered by how much the bundle is actually telling us, strongest first:
 * Bundle.meta.profile naming a bundle profile; an entry claiming an MPD
 * profile (a prescription has no bundle-level profile to claim);
 * Composition.type; an ImagingStudy in the bundle; medication orders in a
 * bundle with no Composition. Anything else reads as a patient summary.
 */
export function detectDocumentType(bundle) {
  if (!isObj(bundle)) return PRIMARY_TYPE;
  const claimed = metaProfiles(bundle);
  for (const doc of DOCUMENT_TYPES) {
    if (doc.bundles.some((url) => claimed.includes(url))) return doc;
  }
  const resourceTypes = new Set();
  const entryClaims = new Set();
  let codes = null;
  for (const entry of list(bundle.entry)) {
    const resource = isObj(entry) ? entry.resource : null;
    if (!isObj(resource)) continue;
    if (isStr(resource.resourceType)) resourceTypes.add(resource.resourceType);
    for (const claim of metaProfiles(resource)) entryClaims.add(claim);
    if (resource.resourceType === "Composition" && codes === null) {
      codes = list(isObj(resource.type) ? resource.type.coding : null)
        .filter((c) => isObj(c) && isStr(c.code) && c.system === "http://loinc.org")
        .map((c) => c.code);
    }
  }
  for (const doc of DOCUMENT_TYPES) {
    if (doc.entryProfiles.some((url) => entryClaims.has(url))) return doc;
  }
  for (const doc of DOCUMENT_TYPES) {
    if (doc.loinc.some((code) => (codes || []).includes(code))) return doc;
  }
  if (resourceTypes.has("ImagingStudy")) return TYPE_BY_ID.imaging;
  // Only when there is no Composition: a patient summary carries a medication
  // section, and reading one as a prescription would be wrong.
  if (!resourceTypes.has("Composition")
      && (resourceTypes.has("MedicationRequest") || resourceTypes.has("MedicationDispense"))) {
    return TYPE_BY_ID.mpd;
  }
  return PRIMARY_TYPE;
}

/** Document-level answer to "can a clinician trust and use this?". */
function summaryQuality(summary) {
  const items = summary.sections.flatMap((sec) => sec.items).concat(summary.unreferenced);
  const gapCounts = new Map();
  const categories = {};
  const dates = [];
  for (const item of items) {
    for (const gap of item.gaps || []) gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
    const category = item.category || "other";
    categories[category] = (categories[category] || 0) + 1;
    if (item.date) dates.push(item.date);
  }
  // A narrative-only section (a patient story) carries data as surely as one
  // with entries; it is only coded differently.
  const populated = summary.sections.filter((sec) => sec.items.length || sec.narrative).length;
  const least = (a, b) => (b < a ? b : a);
  const most = (a, b) => (b > a ? b : a);
  return {
    items: items.length,
    coded: items.filter((i) => i.code).length,
    dated: dates.length,
    with_gaps: items.filter((i) => i.gaps && i.gaps.length).length,
    gaps: Object.fromEntries([...gapCounts].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))),
    categories,
    sections_populated: populated,
    sections_empty: summary.sections.length - populated,
    earliest: dates.length ? dates.reduce(least) : null,
    latest: dates.length ? dates.reduce(most) : null,
  };
}

// IPS/EPS section identity. The LOINC code is the reliable signal - documents
// are written in the local language, so titles alone cannot be matched.
const SECTION_LOINC_KINDS = {
  "104605-1": "alert",
  "81338-6": "story",
  "48765-2": "allergy",
  "10160-0": "medication",
  "11450-4": "problem",
  "11348-0": "problem",
  "47519-4": "procedure",
  "30954-2": "result",
  "8716-3": "result",
  "11369-6": "immunization",
  "46264-8": "device",
  "18776-5": "plan",
  "42348-3": "directive",
};

// Every section the EPS Composition (1.0.0-ballot) defines, required ones
// first. Coverage is measured against this, not against whatever sections the
// document happens to carry - otherwise the sections that are missing are
// exactly the ones that never show up as gaps.
const EPS_SECTIONS = [
  ["11450-4", "Problems", true],
  ["48765-2", "Allergies and intolerances", true],
  ["10160-0", "Medication summary", true],
  ["47519-4", "History of procedures", true],
  ["46264-8", "Medical devices", true],
  ["104605-1", "Alerts", false],
  ["11369-6", "Immunizations", false],
  ["30954-2", "Results", false],
  ["8716-3", "Vital signs", false],
  ["18776-5", "Plan of care", false],
  ["47420-5", "Functional status", false],
  ["42348-3", "Advance directives", false],
  ["29762-2", "Social history", false],
  ["10162-6", "History of pregnancy", false],
  ["11329-0", "Patient history", false],
  ["10182-4", "Travel history", false],
  ["81338-6", "Patient story", false],
];
const PATIENT_SUMMARY_LOINC = "60591-5";
const NIL_KNOWN = "nilknown";

const codingCodes = (cc) => (isObj(cc) && Array.isArray(cc.coding)
  ? cc.coding.filter(isObj).map((c) => String(c.code ?? "None")) : []);

/** data | stated-none | none-known | missing.
 *
 * stated-none: an explicit "no known X" entry. none-known: emptyReason
 * nilknown - nothing known, but no record that anyone asked. missing: no data
 * and no statement, or a statement that the information is unavailable. */
function sectionState(reason, items, narrative) {
  if (narrative || items.some((i) => !i.assertion)) return "data";
  if (items.some((i) => i.assertion === "none-known")) return "stated-none";
  if (!items.length && isObj(reason)) {
    const codes = list(reason.coding).filter(isObj).map((c) => squash(String(c.code || "")));
    if (codes.includes(NIL_KNOWN) || squash(ccDisplay(reason) || "") === NIL_KNOWN) {
      return "none-known";
    }
  }
  return "missing";
}

/** Per EPS section: present with data, stated none, nil known, present but
 * missing, or absent. Null when the document is not a patient summary. */
function epsCoverage(composition, states) {
  if (!codingCodes(composition.type).includes(PATIENT_SUMMARY_LOINC)) return null;
  return EPS_SECTIONS.map(([code, name, required]) => (
    { code, name, required, state: states.has(code) ? states.get(code) : "absent" }));
}

const SECTION_TITLE_KINDS = [
  ["alert", /alert|uppm.rksamhet|varning|warnung/],
  ["allergy", /allerg|intoleran/],
  ["medication", /medicat|medikat|medicin|pharma/],
  ["problem", /problem|condition|diagnos|krankheit/],
  ["procedure", /procedur|eingriff|therapien/],
  ["immunization", /immunis|immuniz|vaccin|impf/],
  ["device", /device|implantat|ger.te|hilfsmittel/],
  ["result", /result|befund|labor|ergebnis/],
  ["plan", /plan of care|care plan|behandlungsplan/],
];

/** What clinical section this is, independent of its language. */
function sectionKind(section, title) {
  if (isObj(section.code)) {
    for (const coding of list(section.code.coding)) {
      if (!isObj(coding)) continue;
      const kind = lookup(SECTION_LOINC_KINDS, String(coding.code || ""));
      if (kind) return kind;
    }
  }
  const lowered = (title || "").toLowerCase();
  for (const [kind, pattern] of SECTION_TITLE_KINDS) if (pattern.test(lowered)) return kind;
  return "other";
}

function patientContacts(patient) {
  const out = [];
  for (const contact of list(patient.contact)) {
    if (!isObj(contact)) continue;
    const name = isObj(contact.name) ? humanName([contact.name]) : null;
    const roles = [];
    for (const rel of list(contact.relationship)) {
      const role = ccDisplay(rel);
      if (role && !roles.includes(role)) roles.push(role);
    }
    let number = null;
    for (const point of list(contact.telecom)) {
      if (isObj(point) && isStr(point.value)
          && [undefined, null, "phone", "sms"].includes(point.system)) {
        number = point.value.trim();
        break;
      }
    }
    const address = contact.address;
    const place = isObj(address)
      ? ["city", "country"].filter((k) => text(address[k])).map((k) => address[k].trim()).join(", ")
      : "";
    if (name || number) {
      out.push({ name, relationship: roles.join(", ") || null, phone: number,
        place: place || null });
    }
  }
  return out;
}

/** What the patient speaks, the preferred language first. */
function patientLanguages(patient) {
  const entries = list(patient.communication).filter(isObj);
  const ordered = entries.filter((c) => c.preferred === true)
    .concat(entries.filter((c) => c.preferred !== true));
  const out = [];
  for (const entry of ordered) {
    const name = ccDisplay(entry.language);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Who looks after the patient and how each is reached. */
function careTeams(entries, byRef) {
  const out = [];
  for (const { resource: team } of entries) {
    if (team.resourceType !== "CareTeam") continue;
    const members = [];
    for (const part of list(team.participant)) {
      if (!isObj(part)) continue;
      const name = referenceName(part.member, byRef);
      if (!name) continue;
      let role = null;
      for (const cc of list(part.role)) {
        role = ccDisplay(cc);
        if (role) break;
      }
      const target = resolveReference(part.member.reference, byRef);
      members.push({ name, role, phone: phone(target) });
    }
    if (members.length || phone(team)) {
      out.push({ name: firstStr(team, "name"), phone: phone(team), note: noteText(team),
        members });
    }
  }
  return out;
}

/** Who wrote the document and which organisation keeps it. */
function documentSource(composition, byRef) {
  const authors = [];
  for (const ref of list(composition.author)) {
    const name = referenceName(ref, byRef);
    if (name && !authors.includes(name)) authors.push(name);
  }
  const custodian = composition.custodian;
  const organization = referenceName(custodian, byRef);
  let country = null;
  const target = isObj(custodian) ? resolveReference(custodian.reference, byRef) : null;
  for (const address of list(isObj(target) ? target.address : null)) {
    if (isObj(address) && isStr(address.country)) {
      country = address.country.trim() || null;
      break;
    }
  }
  if (authors.includes(organization)) authors.splice(authors.indexOf(organization), 1);
  if (!authors.length && !organization) return null;
  return { authors, organization, country };
}

function patientSummary(patient) {
  const identifiers = [];
  for (const ident of list(patient.identifier)) {
    if (isObj(ident) && isStr(ident.value)) {
      identifiers.push({ system: isStr(ident.system) ? ident.system : null, value: ident.value });
    }
  }
  return {
    name: humanName(patient.name),
    birth_date: isStr(patient.birthDate) ? patient.birthDate : null,
    gender: isStr(patient.gender) ? patient.gender : null,
    identifiers,
    contacts: patientContacts(patient),
    languages: patientLanguages(patient),
  };
}

// EPS sections a receiving clinician decides on, each with what its absence
// leaves unknown.
const PREGNANCY_LOINC = "10162-6";
const ADVANCE_DIRECTIVES_LOINC = "42348-3";
const SOCIAL_HISTORY_LOINC = "29762-2";
const DECISIVE_SECTIONS = [
  ["47420-5", "prior function, ADL and cognition unknown"],
  [ADVANCE_DIRECTIVES_LOINC,
    "limitations of treatment unknown - not to be assumed from age or comorbidity"],
  ["8716-3", "no weight, so weight-based dosing cannot be checked"],
  [SOCIAL_HISTORY_LOINC, "living situation and support unknown"],
  [PREGNANCY_LOINC, "pregnancy status not stated"],
];
// What the document does say about support, when it has no social history.
const SOCIAL_ELSEWHERE = "no social history - living situation and support only as far "
  + "as the care plan or patient story says";
const ADULT_YEARS = 18;
// Kidney function and weight decide the dose of an anticoagulant.
const EGFR_LOINC = new Set(["62238-1", "98979-8", "77147-7", "48642-3", "48643-1", "33914-3",
  "50044-7", "69405-9", "88293-6", "88294-4", "50210-4"]);
const CREATININE_LOINC = new Set(["14682-9", "2160-0", "38483-4", "59826-8"]);
const WEIGHT_LOINC = new Set(["29463-7", "3141-9"]);
const EGFR_WORDS = /glomerular filtration|\begfr\b/i;
const RESULTS_REFERENCE_DAYS = 30; // older than this: not a current basis for decisions
const RESULTS_OUTDATED_DAYS = 180; // older than this: repeat them
const NOTED_WITHIN_DAYS = 365;

const isoFormat = ([y, m, d]) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function monthsBetween(earlier, later) {
  const months = (later[0] - earlier[0]) * 12 + later[1] - earlier[1];
  return later[2] < earlier[2] ? months - 1 : months;
}

function ageWords(earlier, later) {
  const months = Math.max(1, monthsBetween(earlier, later));
  if (months >= 24) return `${Math.floor(months / 12)} years`;
  return months === 1 ? "1 month" : `${months} months`;
}

function birthDay(value) {
  if (!isStr(value)) return null;
  return isoDay(value) || isoDay(value.slice(0, 7) + "-01") || isoDay(value.slice(0, 4) + "-01-01");
}

function ageYears(summary) {
  const birth = birthDay((summary.patient || {}).birth_date);
  const asOf = isoDay(summary.as_of);
  return birth && asOf ? Math.floor(monthsBetween(birth, asOf) / 12) : null;
}

/** The newest kidney function and weight the document carries, or null for
 * each it does not: shown beside an anticoagulant, where they decide the dose. */
function dosingBasis(items) {
  const newest = (match) => {
    let best = null;
    for (const item of items) {
      if (item.category !== "result" || !item.detail || item.gaps.includes("no value")
          || !match(item)) continue;
      if (best === null || String(item.date || "") > String(best.date || "")) best = item;
    }
    return best && { value: best.detail.split("; ")[0],
      direction: best.direction ?? null, date: best.date ?? null };
  };
  const egfr = newest((i) => EGFR_LOINC.has(i.code) || EGFR_WORDS.test(String(i.label || "")));
  const creatinine = newest((i) => CREATININE_LOINC.has(i.code));
  const renal = egfr ? { ...egfr, name: "eGFR" }
    : creatinine ? { ...creatinine, name: "Creatinine" } : null;
  return { renal, weight: newest((i) => WEIGHT_LOINC.has(i.code)) };
}

/** True or false when sex and age settle it, null when they do not. */
function childbearing(summary) {
  const patient = summary.patient || {};
  const gender = String(patient.gender).toLowerCase();
  if (gender === "male") return false;
  const birth = birthDay(patient.birth_date);
  const asOf = isoDay(summary.as_of);
  if (gender !== "female" || !birth || !asOf) return null;
  const years = Math.floor(monthsBetween(birth, asOf) / 12);
  return years >= 12 && years <= 55;
}

/** What is outdated or missing and has to be checked before the document is
 * relied on, in the order a reader should take it. */
function attention(summary) {
  const items = summary.sections.flatMap((sec) => sec.items).concat(summary.unreferenced);
  const asOf = isoDay(summary.as_of);
  const out = [];
  const add = (kind, title, detail = null, date = null, extra = {}) => {
    out.push({ kind, title, detail, date, ...extra });
  };

  for (const item of items) {
    if (!item.flags.includes("cancelled")) continue;
    const was = item.date_kind === "was scheduled"
      ? `Was scheduled ${item.date.slice(0, 10)}.` : null;
    add("cancelled", `Cancelled: ${item.label}`,
      [was, item.note].filter(Boolean).join(" ") || null, item.date);
  }

  for (const item of asOf ? items : []) {
    if (!["device", "plan"].includes(item.category) || item.flags.includes("cancelled")) continue;
    for (const noted of item.note_dates) {
      const day = isoDay(noted.value);
      const age = day ? dayNumber(asOf) - dayNumber(day) : -1;
      if (age >= 0 && age <= NOTED_WITHIN_DAYS) {
        // the sentence is the warning; what it was written on is context
        const kind = item.category === "plan" ? "Care plan" : "Device";
        add("noted", noted.text, `${kind}: ${item.label}`, noted.value);
      }
    }
  }

  // An Observation outside the results sections (smoking status, say) is not
  // a lab result, unless the document files its results nowhere else.
  let results = summary.sections.filter((sec) => sec.kind === "result")
    .flatMap((sec) => sec.items.filter((i) => i.category === "result"));
  if (!results.length) results = items.filter((i) => i.category === "result");
  const days = results.map((i) => isoDay(i.date)).filter(Boolean);
  const newest = days.length
    ? days.reduce((a, b) => (dayNumber(b) > dayNumber(a) ? b : a)) : null;
  if (asOf && newest && dayNumber(asOf) - dayNumber(newest) > RESULTS_REFERENCE_DAYS) {
    let detail = `${ageWords(newest, asOf)} before this document. `
      + (dayNumber(asOf) - dayNumber(newest) > RESULTS_OUTDATED_DAYS
        ? "They are out of date and need repeating."
        : "They are reference values, not a current basis for decisions.");
    const abnormal = [];
    for (const i of results) {
      if (!i.flags.includes("abnormal") || i.gaps.includes("no value") || !i.detail) continue;
      const day = isoDay(i.date);
      // an older one among them is dated, or it reads as from the newest day
      const aside = [i.direction,
        day && dayNumber(day) !== dayNumber(newest) ? isoFormat(day) : null]
        .filter(Boolean).join(", ");
      abnormal.push(`${shortLabel(i.label)} ${i.detail.split("; ")[0]}`
        + (aside ? ` (${aside})` : ""));
    }
    // all of them: the one folded into "and 2 more" is the one that matters
    if (abnormal.length) detail += ` Flagged abnormal: ${abnormal.join(", ")}.`;
    add("stale-results", `Newest results are from ${isoFormat(newest)}`, detail,
      isoFormat(newest));
  }

  let meds = items.filter((i) => i.category === "medication" && !i.assertion);
  if (meds.length && !meds.some((i) => ["given", "dispensed"].includes(i.basis))) {
    // what was stopped is not part of what is taken now
    const current = meds.filter(
      (i) => !MEDICATION_ENDED.includes(String(i.status || "").toLowerCase()));
    if (current.length) meds = current;
    const stated = meds.some((i) => i.basis === "stated as taking");
    const prescribed = meds.some((i) => i.basis === "prescribed");
    let count;
    if (meds.length === 1) {
      count = stated ? "The one entry is a statement of what is taken"
        : "The one entry is a prescription";
    } else {
      count = `${meds.length} entries are ` + [
        stated ? "statements of what is taken" : null,
        prescribed ? "prescriptions" : null].filter(Boolean).join(" and ");
    }
    add("unreconciled", "Medication list not reconciled",
      `${count}. The document carries no last-dose, dispensing or reconciliation date - `
      + "confirm with the patient what is actually taken and when the last dose was.");
  }

  const coverage = new Map((summary.coverage || []).map((c) => [c.code, c]));
  const canBePregnant = childbearing(summary) === true;
  const age = ageYears(summary);
  const saidElsewhere = summary.sections.some((sec) => sec.narrative)
    || items.some((i) => i.category === "plan" && !i.flags.includes("cancelled"));
  const names = [];
  const reasons = [];
  const codes = [];
  for (const [code, why] of DECISIVE_SECTIONS) {
    const section = coverage.get(code);
    if (!section || !["absent", "missing"].includes(section.state)) continue;
    if (code === PREGNANCY_LOINC && !canBePregnant) continue;
    if (code === ADVANCE_DIRECTIVES_LOINC && age !== null && age < ADULT_YEARS) continue;
    names.push(section.name);
    reasons.push(code === SOCIAL_HISTORY_LOINC && saidElsewhere ? SOCIAL_ELSEWHERE : why);
    codes.push(code);
  }
  if (names.length) {
    const detail = reasons.join("; ");
    add("missing", "Not in this document: " + names.join(", "),
      detail[0].toUpperCase() + detail.slice(1) + ".", null, { sections: codes });
  }
  return out;
}

/** Every "reference" string inside a JSON value. Iterative, so a deeply
 * nested bundle cannot overflow the stack. */
function collectReferences(value) {
  const out = [];
  const stack = [value];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) stack.push(...node);
    else if (isObj(node)) {
      if (isStr(node.reference)) out.push(node.reference);
      stack.push(...Object.values(node));
    }
  }
  return out;
}

const sectionTitle = (section) =>
  firstStr(section, "title") || ccDisplay(section.code) || "Untitled section";

function emptySummary() {
  return {
    patient: null,
    composition: null,
    sections: [],
    unreferenced: [],
    coverage: null,
    quality: summaryQuality({ sections: [], unreferenced: [] }),
    as_of: null,
    attention: [],
    source: null,
    care_teams: [],
    dosing: { renal: null, weight: null },
  };
}

function summarizeBundle(bundle) {
  const summary = emptySummary();
  if (!isObj(bundle) || !Array.isArray(bundle.entry)) return summary;
  const entries = bundle.entry.filter((e) => isObj(e) && isObj(e.resource));
  const byRef = buildReferenceIndex(entries);
  const alerts = alertTargets(entries, byRef);
  summary.care_teams = careTeams(entries, byRef);
  let composition = null;
  let patient = null;
  for (const { resource } of entries) {
    if (resource.resourceType === "Composition" && composition === null) composition = resource;
    else if (resource.resourceType === "Patient" && patient === null) patient = resource;
  }
  if (patient !== null) summary.patient = patientSummary(patient);
  let reachable = new Set();
  if (composition !== null) {
    summary.composition = {
      title: firstStr(composition, "title"),
      date: firstStr(composition, "date"),
      // A BCP-47 code. The Composition's own wins; a document that only says
      // it on the Bundle is still written in it.
      language: firstStr(composition, "language") || firstStr(bundle, "language"),
    };
    const asOf = isoDay(summary.composition.date);
    summary.as_of = asOf ? isoFormat(asOf) : null;
    const sectionStates = new Map();
    for (const section of list(composition.section)) {
      if (!isObj(section)) continue;
      const title = sectionTitle(section);
      const items = [];
      // A lab report keeps its results in sub-sections ("Blood examinations"
      // under "Laboratory examinations"); their entries belong to the
      // top-level section, tagged with the sub-section they came from.
      // Depth-first in document order. A section with nothing of its own
      // speaks through its sub-sections' emptyReason or, lacking one, their
      // narrative - as a top-level one does.
      const subTexts = [];
      const subReasons = [];
      const stack = [[section, null]];
      while (stack.length) {
        const [node, sub] = stack.pop();
        if (sub) {
          if (ccDisplay(node.emptyReason)) subReasons.push(node.emptyReason);
          else if (!Array.isArray(node.entry)) {
            const narrative = sectionNarrative(node);
            if (narrative) subTexts.push(`${sub}\n${narrative}`);
          }
        }
        for (const refEntry of list(node.entry)) {
          if (!isObj(refEntry)) continue;
          const target = resolveReference(refEntry.reference, byRef);
          if (target === null) continue;
          const item = renderResource(target, byRef, alerts);
          if (sub) item.subsection = sub;
          items.push(item);
        }
        // The nearest title only: a path would grow with the depth, and the
        // depth is the author's.
        for (const child of list(node.section).slice().reverse()) {
          if (isObj(child)) stack.push([child, sectionTitle(child)]);
        }
      }
      let emptyReason = null;
      let narrative = null;
      let reason = section.emptyReason;
      if (!ccDisplay(reason)) {
        reason = subReasons.length && !subTexts.length ? subReasons[0] : null;
      }
      if (!items.length) {
        emptyReason = ccDisplay(reason);
        if (emptyReason) {
          emptyReason = lookup(EMPTY_REASON_LABELS, squash(emptyReason), emptyReason);
        } else if (!Array.isArray(section.entry)) {
          // No entries and no reason for the lack: the section's content is
          // its narrative (a patient story), so the views show that rather
          // than "No entries".
          narrative = sectionNarrative(section) || subTexts.join("\n") || null;
        }
      }
      const state = sectionState(reason, items, narrative);
      for (const code of codingCodes(section.code)) {
        if (!sectionStates.has(code)) sectionStates.set(code, state);
      }
      summary.sections.push({ title, kind: sectionKind(section, title), items,
        empty_reason: emptyReason, narrative, state });
    }
    summary.source = documentSource(composition, byRef);
    summary.coverage = epsCoverage(composition, sectionStates);
    if (childbearing(summary) === false) {
      // a section that cannot apply is not one that "was not sent"
      for (const section of summary.coverage || []) {
        if (section.code === PREGNANCY_LOINC) section.applicable = false;
      }
    }
    // Everything reachable from the Composition (section entries, authors,
    // and transitively from referenced resources) counts as referenced.
    const queue = [composition];
    const seen = new Set([composition]);
    while (queue.length) {
      for (const ref of collectReferences(queue.pop())) {
        const target = resolveReference(ref, byRef);
        if (target !== null && !seen.has(target)) {
          seen.add(target);
          reachable.add(target);
          queue.push(target);
        }
      }
    }
  } else if (bundle.type !== "document") {
    // A collection - a prescription travels as one - has no Composition for
    // its entries to be orphaned from. Its clinical entries are its content;
    // the rest (the prescriber, the RequestGroup tying the orders together)
    // are their context, as an author is a document's. A bundle with no
    // clinical entry at all shows what it has rather than nothing.
    const content = entries.map((e) => e.resource)
      .filter((r) => !["Composition", "Patient"].includes(r.resourceType));
    let items = content.filter((r) => lookup(ITEM_CATEGORIES, r.resourceType))
      .map((r) => renderResource(r, byRef, alerts));
    if (!items.length) items = content.map((r) => renderResource(r, byRef, alerts));
    if (items.length) {
      summary.sections.push({ title: "Entries", kind: "other", items, empty_reason: null,
        narrative: null });
    }
    reachable = new Set(entries.map((e) => e.resource));
  }
  for (const { resource } of entries) {
    if (["Composition", "Patient"].includes(resource.resourceType)) continue;
    if (reachable.has(resource)) continue;
    summary.unreferenced.push(renderResource(resource, byRef, alerts));
  }
  summary.dosing = dosingBasis(
    summary.sections.flatMap((sec) => sec.items).concat(summary.unreferenced));
  summary.quality = summaryQuality(summary);
  summary.attention = attention(summary);
  return summary;
}

/**
 * The view model of a FHIR document Bundle (a parsed object).
 *
 * Fully defensive: malformed input yields an empty but well-formed summary,
 * never an exception. Sections resolve their entry references against
 * entry.fullUrl (exact), the fullUrl's trailing "Type/id", or the resource's
 * own "resourceType/id". Clinical resources not reachable from the
 * Composition are listed under "unreferenced" as a data-quality hint. A
 * bundle that is not a document (a prescription is a collection) has no
 * Composition, so its clinical entries make up one "Entries" section.
 *
 * `options.today` (YYYY-MM-DD, default: today in UTC) is the day a name with
 * an end date is judged current or former against.
 */
export function summarize(bundle, options = {}) {
  setToday(options.today || new Date().toISOString().slice(0, 10));
  try {
    return summarizeBundle(bundle);
  } catch {
    return emptySummary();
  }
}
