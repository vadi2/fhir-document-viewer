// One clinical resource as the item every view shows: label, detail, status,
// dates, coding, the flags that make it stand out and the gaps that make it
// hard to use. Ported from Provbana's summariser (provbana/app.py).

import {
  isObj, isStr, list, text, lookup, words, ccDisplay, quantityStr, periodStr, firstStr,
  choiceStr, observationValue, resolveReference, referenceTarget, medicationName,
  dosageDetail, humanizeType, extensions, conceptCoding, conceptWords, isoDay, ISO_DAY,
} from "./datatypes.js";

export const MEDICATION_TYPES = ["MedicationStatement", "MedicationRequest",
  "MedicationDispense", "MedicationAdministration"];

// Clinical grouping shared by every view. An alert is what the author wants
// read before anything else - a difficult airway, an immunosuppressant - so it
// is its own category rather than "other", and the views put it first.
export const ITEM_CATEGORIES = {
  Flag: "alert",
  AllergyIntolerance: "allergy",
  Condition: "problem",
  MedicationStatement: "medication",
  MedicationRequest: "medication",
  MedicationDispense: "medication",
  MedicationAdministration: "medication",
  Observation: "result",
  Procedure: "procedure",
  Immunization: "immunization",
  CarePlan: "plan",
  Device: "device",
  DeviceUseStatement: "device",
};

// Categories where a missing date makes the item clinically hard to use. An
// allergy without an onset is normal; a lab result without one is not.
const DATE_EXPECTED = ["problem", "procedure", "immunization", "result", "medication"];

// v3-ObservationInterpretation codes that mean "look at this".
const ABNORMAL_INTERPRETATIONS = new Set(
  ["A", "AA", "H", "HH", "HU", "L", "LL", "LU", "POS", "R", "RR", "W"]);

const EVENT_DATE_FIELDS = {
  Flag: ["period"],
  Condition: ["onsetDateTime", "onsetPeriod", "recordedDate"],
  AllergyIntolerance: ["onsetDateTime", "recordedDate"],
  Procedure: ["performedDateTime", "performedPeriod"],
  Immunization: ["occurrenceDateTime", "recorded"],
  Observation: ["effectiveDateTime", "effectivePeriod", "issued"],
  MedicationStatement: ["effectiveDateTime", "effectivePeriod", "dateAsserted"],
  MedicationRequest: ["authoredOn"],
  MedicationDispense: ["whenHandedOver", "whenPrepared"],
  MedicationAdministration: ["effectiveDateTime", "effectivePeriod"],
  DocumentReference: ["date"],
  CarePlan: ["period", "created"],
  DeviceUseStatement: ["timingDateTime", "timingPeriod", "recordedOn"],
};
const DEFAULT_DATE_FIELDS = ["date", "effectiveDateTime", "recordedDate"];

// Onset, recording, verification, plan start and the event itself are
// different facts; each date is shown under the name of the field it came from.
const DATE_FIELD_LABELS = {
  onsetDateTime: "onset",
  onsetPeriod: "onset",
  abatementDateTime: "resolved",
  recordedDate: "recorded",
  recorded: "recorded",
  recordedOn: "recorded",
  lastOccurrence: "last reaction",
  dateAsserted: "asserted",
  issued: "issued",
  performedDateTime: "performed",
  performedPeriod: "performed",
  occurrenceDateTime: "given",
  authoredOn: "prescribed",
  whenHandedOver: "dispensed",
  whenPrepared: "prepared",
  created: "plan created",
  timingDateTime: "in use since",
  timingPeriod: "in use since",
  date: "dated",
};
const DATE_FIELD_LABELS_BY_TYPE = {
  Observation: { effectiveDateTime: "taken", effectivePeriod: "taken" },
  MedicationStatement: { effectiveDateTime: "taking since", effectivePeriod: "taking since" },
  MedicationAdministration: { effectiveDateTime: "given", effectivePeriod: "given" },
  Flag: { period: "since" },
  CarePlan: { period: "plan start" },
};
// Every date a reader may need, not only the one the item sorts by.
const ALL_DATE_FIELDS = {
  Condition: ["onsetDateTime", "onsetPeriod", "abatementDateTime", "recordedDate"],
  AllergyIntolerance: ["onsetDateTime", "lastOccurrence", "recordedDate"],
  Immunization: ["occurrenceDateTime", "recorded"],
  Observation: ["effectiveDateTime", "effectivePeriod", "issued"],
  MedicationStatement: ["effectiveDateTime", "effectivePeriod", "dateAsserted"],
  CarePlan: ["period", "created"],
  DeviceUseStatement: ["timingDateTime", "timingPeriod", "recordedOn"],
};

// IPS absent/unknown statements. A "no known X" entry is the author's explicit
// negative statement; a "no X info" entry says the information is missing.
const IPS_ABSENT_SYSTEM = "http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips";
const SNOMED_NONE_KNOWN = new Set([
  "716186003", // No known allergy
  "409137002", // No known drug allergy
  "428607008", // No known environmental allergy
  "429625007", // No known food allergy
  "160245001", // No current problems or disability
]);

// ATC groups whose presence changes what a surgeon or anaesthetist does next.
const ANTICOAGULANT_ATC = ["B01AA", "B01AB", "B01AE", "B01AF"];
// Insulins: a high-alert medicine wherever the patient turns up.
const INSULIN_ATC = ["A10A"];
// Opioids, benzodiazepines, z-drugs and central stimulants: under narcotics
// control in most countries. Which rules apply is national law, so the flag
// marks a class to ask about (carrying, prescribing), not a legal status.
const CONTROLLED_ATC = ["N01AH", "N02A", "N05BA", "N05CD", "N05CF", "N07BC",
  "N06BA01", "N06BA02", "N06BA03", "N06BA04", "N06BA11", "N06BA12"];
// Conditions that change what is done in the first minutes whatever the
// presenting complaint. Matched on the coded display and text, since a
// document bundle carries no hierarchy to test a code against.
const HIGH_RISK_CONDITION = new RegExp(
  "heart failure|hj.rtsvikt|hjertesvigt|hjertesvikt|herzinsuffizienz"
  + "|type 1 diabetes|diabetes mellitus type 1|typ 1[- ]diabetes|diabetes (mellitus )?typ 1"
  + "|adrenal insufficiency|binjurebarksvikt|addison"
  + "|ha?emophilia|hemofili", "iu");
const CONDITION_OVER = ["resolved", "remission", "inactive"];
// A plan written for the moment things go wrong is read first, not last.
const SAFETY_PLAN = new RegExp(
  "safety plan|crisis plan|emergency (care )?plan|s.kerhetsplan|krisplan"
  + "|sikkerhedsplan|sikkerhetsplan|kriseplan|turvasuunnitelma"
  + "|kriisisuunnitelma|krisenplan|notfallplan", "iu");

// A statement, a prescription, a dispensing and a dose given are different
// evidence that the patient actually takes the medicine.
const MEDICATION_BASIS = {
  MedicationStatement: "stated as taking",
  MedicationRequest: "prescribed",
  MedicationDispense: "dispensed",
  MedicationAdministration: "given",
};
export const MEDICATION_ENDED = ["completed", "stopped"];

// HumanName.use, best first: the name on the banner is the one the person
// goes by now, not a maiden name listed before it.
const NAME_USE_RANK = { official: 0, usual: 1, temp: 2, nickname: 3, anonymous: 3,
  old: 4, maiden: 4 };

const clock = { today: "" };
/** The day names are judged current or former against, as YYYY-MM-DD. */
export function setToday(day) {
  clock.today = day;
}

/** The current name out of a HumanName list, as text - or, with no current
 * one, the best of the rest. */
export function humanName(names) {
  if (!Array.isArray(names)) return null;
  let best = null;
  for (const name of names) {
    if (!isObj(name)) continue;
    const parts = list(name.given).filter(isStr);
    if (text(name.family)) parts.push(name.family.trim());
    const written = parts.join(" ") || firstStr(name, "text");
    if (!written) continue;
    let rank = lookup(NAME_USE_RANK, name.use, 2);
    const end = isObj(name.period) ? name.period.end : null;
    // an ended name is a former one
    if (isStr(end) && end.slice(0, 10) < clock.today) rank = NAME_USE_RANK.old;
    if (best === null || rank < best.rank) best = { rank, written };
  }
  return best ? best.written : null;
}

/** Who a Reference points at: its display, else the name of the resource it
 * resolves to (a PractitionerRole is named by its practitioner or
 * organisation). */
export function referenceName(ref, byRef, follow = true) {
  if (!isObj(ref)) return null;
  if (text(ref.display)) return text(ref.display);
  const target = resolveReference(ref.reference, byRef);
  if (!isObj(target)) return null;
  if (text(target.name)) return text(target.name);
  const human = humanName(target.name);
  if (human || !follow) return human;
  for (const key of ["practitioner", "organization"]) {
    const found = referenceName(target[key], byRef, false);
    if (found) return found;
  }
  return null;
}

export function phone(resource) {
  for (const point of list(isObj(resource) ? resource.telecom : null)) {
    if (isObj(point) && text(point.value)
        && [undefined, null, "phone", "sms"].includes(point.system)) {
      return point.value.trim();
    }
  }
  return null;
}

/** The CodeableConcept that carries the resource's clinical meaning. */
function primaryConcept(resource, rtype, byRef) {
  if (MEDICATION_TYPES.includes(rtype)) {
    if (isObj(resource.medicationCodeableConcept)) return resource.medicationCodeableConcept;
    const ref = resource.medicationReference;
    const target = isObj(ref) ? referenceTarget(resource, ref.reference, byRef) : null;
    return isObj(target) ? target.code : null;
  }
  if (rtype === "Immunization") return resource.vaccineCode;
  if (rtype === "Device") return resource.type;
  if (rtype === "DeviceUseStatement") {
    const ref = resource.device;
    const target = isObj(ref) ? referenceTarget(resource, ref.reference, byRef) : null;
    return isObj(target) ? target.type : null;
  }
  if (rtype === "CarePlan") {
    return Array.isArray(resource.category) && resource.category.length
      ? resource.category[0] : null;
  }
  if (rtype === "DocumentReference") return resource.type;
  return resource.code;
}

function dateValue(resource, key) {
  const val = resource[key];
  if (text(val)) return text(val);
  if (isObj(val) && text(val.start)) return text(val.start);
  return null;
}

const dateLabel = (rtype, key) =>
  lookup(lookup(DATE_FIELD_LABELS_BY_TYPE, rtype, {}), key)
  || lookup(DATE_FIELD_LABELS, key, "dated");

/** [sortable ISO date, what that date is], taking a period's start. */
function eventDate(resource, rtype) {
  for (const key of lookup(EVENT_DATE_FIELDS, rtype, DEFAULT_DATE_FIELDS)) {
    const val = dateValue(resource, key);
    if (val) return [val, dateLabel(rtype, key)];
  }
  return [null, null];
}

function allDates(resource, rtype) {
  const out = [];
  const fields = lookup(ALL_DATE_FIELDS, rtype) || lookup(EVENT_DATE_FIELDS, rtype, []);
  for (const key of fields) {
    const val = dateValue(resource, key);
    const label = dateLabel(rtype, key);
    if (val && !out.some((d) => d.kind === label)) out.push({ kind: label, value: val });
  }
  return out;
}

/** "none-known" for an explicit "no known X" entry, "no-info" for an entry
 * that only says the information is unavailable, null for real data. */
function absentStatement(cc) {
  if (!isObj(cc) || !Array.isArray(cc.coding)) return null;
  for (const coding of cc.coding) {
    if (!isObj(coding)) continue;
    const code = String(coding.code || "");
    if (coding.system === IPS_ABSENT_SYSTEM) {
      if (code.startsWith("no-known-")) return "none-known";
      if (code.endsWith("-info")) return "no-info";
    }
    if (coding.system === "http://snomed.info/sct" && SNOMED_NONE_KNOWN.has(code)) {
      return "none-known";
    }
  }
  return null;
}

function hasAtc(concept, prefixes) {
  if (!isObj(concept) || !Array.isArray(concept.coding)) return false;
  return concept.coding.some((c) => isObj(c) && c.system === "http://www.whocc.no/atc"
    && prefixes.some((prefix) => String(c.code || "").startsWith(prefix)));
}

/** When the plan's activity is due, if the document says so as a date. */
function activityScheduled(activity) {
  if (!isObj(activity)) return null;
  const period = activity.scheduledPeriod;
  const candidates = [isObj(period) ? period.start : null];
  if (isoDay(activity.scheduledString)) candidates.push(activity.scheduledString);
  const timing = activity.scheduledTiming;
  const events = isObj(timing) ? timing.event : null;
  if (Array.isArray(events) && events.length) candidates.push(events[0]);
  for (const value of candidates) if (text(value)) return text(value);
  return null;
}

/** [name, phone] of whoever answers for the plan. */
function planOwner(resource, activity, byRef) {
  const refs = [];
  for (const [source, key] of [[activity, "performer"], [resource, "author"],
    [resource, "careTeam"], [resource, "contributor"]]) {
    const value = isObj(source) ? source[key] : null;
    if (Array.isArray(value)) refs.push(...value);
    else refs.push(value);
  }
  for (const ref of refs) {
    const name = referenceName(ref, byRef);
    if (name) return [name, phone(resolveReference(ref.reference, byRef))];
  }
  return [null, null];
}

function medicationEnd(resource, rtype) {
  if (rtype === "MedicationStatement") {
    return isObj(resource.effectivePeriod) ? firstStr(resource.effectivePeriod, "end") : null;
  }
  for (const dosage of list(resource.dosageInstruction)) {
    const timing = isObj(dosage) ? dosage.timing : null;
    const repeat = isObj(timing) ? timing.repeat : null;
    const bounds = isObj(repeat) ? repeat.boundsPeriod : null;
    const end = isObj(bounds) ? firstStr(bounds, "end") : null;
    if (end) return end;
  }
  return null;
}

/** Dates an author wrote into the free text ("no readings since 2026-06-02")
 * that no coded field carries, each with its sentence. */
function noteDates(note, own) {
  if (!isStr(note)) return [];
  const out = [];
  for (const sentence of note.split(/(?<=\.)\s+/)) {
    for (const value of sentence.match(ISO_DAY) || []) {
      const entry = { value, text: sentence.trim() };
      if (isoDay(value) && !own.has(value)
          && !out.some((e) => e.value === entry.value && e.text === entry.text)) {
        out.push(entry);
      }
    }
  }
  return out;
}

function observationAbnormal(resource) {
  for (const cc of list(resource.interpretation)) {
    const code = conceptCoding(cc)[1];
    if (isStr(code) && ABNORMAL_INTERPRETATIONS.has(code.toUpperCase())) return true;
    const label = ccDisplay(cc);
    if (isStr(label) && ["abnormal", "high", "low", "critical", "positive"]
      .includes(label.trim().toLowerCase())) return true;
  }
  return false;
}

const INTERPRETATION_WORDS = {
  H: "high", HU: "high", HH: "critically high",
  L: "low", LU: "low", LL: "critically low",
  AA: "critical", POS: "positive",
};

/** Which way a result is off, when the document says so. */
function observationDirection(resource) {
  for (const cc of list(resource.interpretation)) {
    const code = conceptCoding(cc)[1];
    const word = isStr(code) ? lookup(INTERPRETATION_WORDS, code.toUpperCase()) : null;
    if (word) return word;
    const label = ccDisplay(cc);
    if (isStr(label) && ["high", "low", "critical"].includes(label.trim().toLowerCase())) {
      return label.trim().toLowerCase();
    }
  }
  return null;
}

const afterSpace = (s) => (s.includes(" ") ? s.slice(s.indexOf(" ") + 1) : "");

function referenceRange(resource) {
  for (const range of list(resource.referenceRange)) {
    if (!isObj(range)) continue;
    const low = quantityStr(range.low);
    const high = quantityStr(range.high);
    if (low && high) {
      return afterSpace(low) === afterSpace(high)
        ? `${low.split(" ")[0]}-${high}` : `${low} to ${high}`;
    }
    if (low) return `from ${low}`;
    if (high) return `up to ${high}`;
    const written = firstStr(range, "text");
    if (written) return written;
  }
  return null;
}

/** A LOINC long name cut down to the analyte. A slash is only cut at when the
 * name is still long: "Albumin/Creatinine" is the name of a ratio. */
export function shortLabel(label) {
  let short = label.split(/ \[|,/)[0].trim();
  if ([...short].length > 40) short = short.split("/")[0].trim();
  return short || label;
}

const LOINC_LONG_NAME = /^(.+?) \[[^\]]*\] in (.+?)(?: by .+)?$/;

/** A LOINC long name as a clinician says it: the analyte and what it was
 * measured in, without the property and the method. */
function resultName(label) {
  const match = LOINC_LONG_NAME.exec(label);
  return match ? `${match[1]} (${match[2].toLowerCase()})` : shortLabel(label);
}

function activityDetails(resource) {
  return list(resource.activity).filter((a) => isObj(a) && isObj(a.detail))
    .map((a) => a.detail);
}

/** Every activity of a plan that says more than the plan's own title. */
function planSteps(resource, label) {
  const steps = [];
  for (const detail of activityDetails(resource)) {
    const written = firstStr(detail, "description") || ccDisplay(detail.code);
    if (!written) continue;
    steps.push({ text: words(written), status: firstStr(detail, "status"),
      scheduled: activityScheduled(detail) });
  }
  return steps.length === 1 && steps[0].text === label ? [] : steps;
}

const FLAG_PRIORITY_EXT = "http://hl7.org/fhir/StructureDefinition/flag-priority";
const FLAG_DETAIL_EXT = "http://hl7.org/fhir/StructureDefinition/flag-detail";
const NOTE_EXT = "http://hl7.org/fhir/StructureDefinition/note";

/** PH / PM / PL from the core flag-priority extension, or null. */
function flagPriority(resource) {
  for (const ext of extensions(resource, FLAG_PRIORITY_EXT)) {
    const code = conceptCoding(ext.valueCodeableConcept)[1];
    if (code) return code.toUpperCase();
  }
  return null;
}

/** The EU Core Flag keeps its free text in the core `note` extension, since
 * Flag itself has no note element. */
function flagNote(resource) {
  for (const ext of extensions(resource, NOTE_EXT)) {
    const written = isObj(ext.valueAnnotation) ? ext.valueAnnotation.text : null;
    if (text(written)) return words(written);
  }
  return null;
}

function flagDetailTargets(resource, byRef) {
  const out = [];
  for (const ext of extensions(resource, FLAG_DETAIL_EXT)) {
    const ref = ext.valueReference;
    const target = isObj(ref) ? resolveReference(ref.reference, byRef) : null;
    if (isObj(target)) out.push(target);
  }
  return out;
}

/** What the high-priority alerts point at, by identity. */
export function alertTargets(entries, byRef) {
  const out = new Set();
  for (const { resource } of entries) {
    if (resource.resourceType === "Flag" && flagPriority(resource) === "PH") {
      for (const target of flagDetailTargets(resource, byRef)) out.add(target);
    }
  }
  return out;
}

/** The first Annotation on the resource - where authors put the part that
 * matters most and fits no coded field ("cancelled by the patient, not
 * rebooked"). */
export function noteText(resource) {
  for (const note of list(resource.note)) {
    const written = isObj(note) ? note.text : null;
    if (text(written)) return words(written);
  }
  return null;
}

/** Add what the views need beyond label/detail/status: clinical category,
 * sortable date, coding provenance, salience flags, and the missing-information
 * gaps that decide whether the item is actually usable. */
function annotateItem(item, resource, rtype, byRef, alerts) {
  const category = lookup(ITEM_CATEGORIES, rtype, "other");
  const medication = MEDICATION_TYPES.includes(rtype);
  const concept = primaryConcept(resource, rtype, byRef);
  const [system, code] = conceptCoding(concept);
  let [date, dateKind] = eventDate(resource, rtype);
  const dates = allDates(resource, rtype);
  const status = (item.status || "").trim().toLowerCase();
  // "No known medications" is coded on the medication, not on a `code`.
  const absent = absentStatement(medication ? concept : resource.code);
  const flags = [];
  const gaps = [];
  // a care team is people and phone numbers, with nothing to code
  if (!code && rtype !== "CareTeam") gaps.push("not coded");
  if (!date && DATE_EXPECTED.includes(category) && !absent) gaps.push("no date");
  if (absent) {
    // "No known allergies" has no reaction or criticality to be missing.
    item.assertion = absent;
  } else if (category === "allergy") {
    const criticality = firstStr(resource, "criticality");
    if (criticality === "high") flags.push("high risk");
    else if (!criticality) gaps.push("no criticality");
    if (!Array.isArray(resource.reaction) || !resource.reaction.length) {
      gaps.push("no reaction recorded");
    }
  } else if (category === "medication") {
    if (rtype === "MedicationAdministration") {
      // One dose given on a date: it is neither "active" nor missing a
      // dosage instruction, and the date is the whole point.
      flags.push("last dose");
    } else {
      if (!dosageDetail(resource)) gaps.push("no dose");
      if (status === "active") flags.push("active");
      if (["MedicationStatement", "MedicationRequest"].includes(rtype)
          && MEDICATION_ENDED.includes(status) && !medicationEnd(resource, rtype)) {
        gaps.push("no stop date");
      }
    }
    if (hasAtc(concept, ANTICOAGULANT_ATC)) flags.push("anticoagulant");
    if (hasAtc(concept, INSULIN_ATC)) flags.push("insulin");
    if (hasAtc(concept, CONTROLLED_ATC)) flags.push("controlled drug");
    item.basis = lookup(MEDICATION_BASIS, rtype);
  } else if (category === "alert") {
    if (flagPriority(resource) === "PH") flags.push("high priority");
  } else if (category === "problem") {
    if (status === "active") flags.push("active");
    const severity = ccDisplay(resource.severity);
    if (isStr(severity) && severity.trim().toLowerCase() === "severe") flags.push("severe");
    if (!CONDITION_OVER.includes(status) && HIGH_RISK_CONDITION.test(conceptWords(concept))) {
      flags.push("high risk");
    }
  } else if (category === "result") {
    if (observationValue(resource) === null) gaps.push("no value");
    if (observationAbnormal(resource)) {
      flags.push("abnormal");
      item.direction = observationDirection(resource);
    }
    item.range = referenceRange(resource);
    item.performer = null;
    for (const ref of list(resource.performer)) {
      const name = referenceName(ref, byRef);
      if (name) {
        item.performer = name;
        break;
      }
    }
    const short = resultName(String(item.label || ""));
    if (system === "LOINC" && short !== item.label) item.short = short;
  } else if (category === "plan") {
    // One activity is the plan's news (a visit that is scheduled, or
    // cancelled); several are its steps, and the plan keeps its own status.
    const details = activityDetails(resource);
    const activity = details.length === 1 ? details[0] : null;
    const actStatus = activity ? activity.status : null;
    if (["scheduled", "not-started"].includes(actStatus)) flags.push("planned");
    const cancelled = resource.status === "revoked"
      || (details.length > 0 && details.every((d) => d.status === "cancelled"));
    if (cancelled) {
      flags.push("cancelled");
    } else if (SAFETY_PLAN.test(`${String(item.label || "")} | ${conceptWords(concept)}`)) {
      flags.push("safety plan");
    } else if (list(resource.addresses).some((ref) => isObj(ref)
        && alerts.has(resolveReference(ref.reference, byRef)))) {
      // the plan for what a high-priority alert warns of is read with it
      flags.push("plan for alert");
    }
    item.steps = planSteps(resource, item.label);
    // The appointment is the event; the plan's start only says how long the
    // arrangement has existed.
    const scheduled = activityScheduled(activity);
    if (scheduled) {
      date = scheduled;
      dateKind = cancelled ? "was scheduled" : "scheduled";
      dates.unshift({ kind: dateKind, value: scheduled });
    }
    [item.owner, item.owner_phone] = planOwner(resource, activity, byRef);
    if (!item.owner) gaps.push("no named owner");
  }
  if (category === "allergy" || category === "problem") {
    const verification = ccDisplay(resource.verificationStatus);
    if (verification) item.verification = verification;
  }
  if (["MedicationStatement", "MedicationRequest"].includes(rtype)) {
    const ended = medicationEnd(resource, rtype);
    if (ended) dates.push({ kind: "stopped", value: ended });
  }
  item.category = category;
  item.date = date;
  item.date_kind = dateKind;
  item.dates = dates;
  const own = new Set(dates.map((d) => String(d.value).slice(0, 10)));
  own.add(String(date).slice(0, 10));
  item.note_dates = noteDates(item.note, own);
  item.code = code;
  item.code_system = system;
  item.flags = flags;
  item.gaps = gaps;
}

const joined = (parts) => parts.filter(Boolean).join("; ") || null;

/** One clinical resource as a reader-friendly {label, detail, status, ...}. */
export function renderResource(resource, byRef, alerts = new Set()) {
  const rtype = isStr(resource.resourceType) && resource.resourceType
    ? resource.resourceType : "Resource";
  let status = isStr(resource.status) ? resource.status : null;
  let label;
  let detail = null;
  const covers = [];
  if (rtype === "MedicationAdministration") {
    label = medicationName(resource, byRef);
    const given = choiceStr(resource, "effective");
    const dose = isObj(resource.dosage) ? firstStr(resource.dosage, "text") : null;
    detail = joined([given ? `given ${given}` : null, dose]);
  } else if (MEDICATION_TYPES.includes(rtype)) {
    label = medicationName(resource, byRef);
    detail = dosageDetail(resource);
  } else if (rtype === "Flag") {
    label = ccDisplay(resource.code) || "Alert";
    const parts = [];
    const priority = flagPriority(resource);
    if (priority) {
      parts.push(lookup({ PH: "high priority", PM: "medium priority", PL: "low priority" },
        priority, priority));
    }
    const since = periodStr(resource.period);
    if (since) parts.push(since.includes(" to ") ? since : `since ${since}`);
    detail = joined(parts);
    for (const target of flagDetailTargets(resource, byRef)) {
      const name = MEDICATION_TYPES.includes(target.resourceType)
        ? medicationName(target, byRef) : ccDisplay(target.code);
      if (name && name !== label && !covers.includes(name)) covers.push(name);
    }
  } else if (rtype === "DocumentReference") {
    label = firstStr(resource, "description") || ccDisplay(resource.type) || "Document";
    let url = null;
    for (const content of list(resource.content)) {
      const attachment = isObj(content) ? content.attachment : null;
      url = isObj(attachment) ? firstStr(attachment, "url") : null;
      if (url) break;
    }
    detail = joined([ccDisplay(resource.type), url]);
  } else if (rtype === "AllergyIntolerance") {
    label = ccDisplay(resource.code) || "Allergy or intolerance";
    status = ccDisplay(resource.clinicalStatus) || status;
    const parts = [];
    const criticality = firstStr(resource, "criticality");
    if (criticality) parts.push(`criticality ${criticality}`);
    const manifestations = [];
    for (const reaction of list(resource.reaction)) {
      if (!isObj(reaction)) continue;
      for (const manifestation of list(reaction.manifestation)) {
        const name = ccDisplay(manifestation);
        if (name && !manifestations.includes(name)) manifestations.push(name);
      }
    }
    if (manifestations.length) parts.push("reactions: " + manifestations.join(", "));
    detail = joined(parts);
  } else if (rtype === "Condition") {
    label = ccDisplay(resource.code) || "Condition";
    status = ccDisplay(resource.clinicalStatus) || status;
    const onset = choiceStr(resource, "onset");
    detail = onset ? `onset ${onset}` : null;
  } else if (rtype === "Immunization") {
    label = ccDisplay(resource.vaccineCode) || "Immunization";
    detail = choiceStr(resource, "occurrence");
  } else if (rtype === "Observation") {
    label = ccDisplay(resource.code) || "Observation";
    detail = joined([observationValue(resource), choiceStr(resource, "effective")]);
  } else if (rtype === "Procedure") {
    label = ccDisplay(resource.code) || "Procedure";
    detail = choiceStr(resource, "performed");
  } else if (rtype === "CarePlan") {
    label = firstStr(resource, "title", "description");
    if (!label) {
      for (const activity of list(resource.activity)) {
        if (isObj(activity) && isObj(activity.detail)) {
          label = ccDisplay(activity.detail.code);
          if (label) break;
        }
      }
    }
    if (!label && Array.isArray(resource.category) && resource.category.length) {
      label = ccDisplay(resource.category[0]);
    }
    label = label || "Care plan";
    // The activity is what a reader acts on: a plan can be "active" while its
    // one appointment is cancelled, and the cancellation is the news.
    const details = activityDetails(resource);
    const activity = details.length === 1 ? details[0] : null;
    const parts = [];
    if (activity !== null) {
      if (text(activity.status)) status = activity.status.trim();
      const scheduled = periodStr(activity.scheduledPeriod)
        || firstStr(activity, "scheduledString");
      if (scheduled) parts.push(`scheduled ${scheduled}`);
    }
    const span = periodStr(resource.period);
    if (span) {
      if (span.includes(" to ")) parts.push(`plan ${span}`);
      else if (resource.period.start) parts.push(`plan start ${span}`);
      else parts.push(`plan until ${span}`);
    }
    detail = joined(parts);
  } else if (rtype === "Device") {
    label = ccDisplay(resource.type) || "Device";
  } else if (rtype === "DeviceUseStatement") {
    label = "Device";
    const deviceRef = resource.device;
    if (isObj(deviceRef)) {
      const target = referenceTarget(resource, deviceRef.reference, byRef);
      if (isObj(target)) label = ccDisplay(target.type) || label;
      else if (isStr(deviceRef.display)) label = deviceRef.display;
    }
    const span = periodStr(resource.timingPeriod);
    const started = firstStr(resource, "timingDateTime");
    const recorded = firstStr(resource, "recordedOn");
    if (span && span.includes(" to ")) detail = `in use ${span}`;
    else if (span) {
      detail = resource.timingPeriod.start ? `in use since ${span}` : `in use until ${span}`;
    } else if (started) detail = `in use since ${started}`;
    else if (recorded) detail = `recorded ${recorded}`;
  } else {
    const display = ccDisplay(resource.code) || firstStr(resource, "title", "description");
    if (display) {
      label = display;
      detail = humanizeType(rtype);
    } else {
      label = humanizeType(rtype);
    }
  }
  const item = { label, detail, status,
    note: rtype === "Flag" ? flagNote(resource) : noteText(resource) };
  if (covers.length) item.covers = covers;
  annotateItem(item, resource, rtype, byRef, alerts);
  return item;
}
