// FHIR datatypes as a clinician reads them: quantities, ranges, dosages,
// codings. Ported from Provbana's summariser (provbana/app.py).

export const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isStr = (v) => typeof v === "string";
export const isNum = (v) => typeof v === "number";
export const list = (v) => (Array.isArray(v) ? v : []);
/** The trimmed string, or null when it is not a string or is blank. */
export const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** Own-property lookup, so a code like "constructor" never finds a prototype. */
export const lookup = (table, key, fallback = null) =>
  typeof key === "string" && Object.hasOwn(table, key) ? table[key] : fallback;
/** Runs of whitespace as one space, trimmed. */
export const words = (s) => s.trim().split(/\s+/).join(" ");

// JSON has one number type, FHIR decimals do not: "5.0" and "5" are different
// precisions. JSON.parse drops that, so parseJson() notes which whole numbers
// were written with a decimal point or exponent, and num() prints them back
// with one ("5.0"), as Provbana does.
const DECIMALS = new WeakMap();

export function parseJson(source) {
  return JSON.parse(source, function (key, value, context) {
    if (typeof value === "number" && Number.isInteger(value) && context
        && typeof context.source === "string" && /[.eE]/.test(context.source)) {
      let keys = DECIMALS.get(this);
      if (!keys) DECIMALS.set(this, (keys = new Set()));
      keys.add(key);
    }
    return value;
  });
}

function decimalText(value) {
  if (!Number.isFinite(value)) return String(value);
  const exponent = Number(value.toExponential().split("e")[1]);
  if (value !== 0 && (exponent < -4 || exponent >= 16)) {
    const mantissa = value.toExponential().split("e")[0];
    return `${mantissa}e${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  const fixed = Object.is(value, -0) ? "-0" : String(value);
  return fixed.includes(".") ? fixed : fixed + ".0";
}

/** holder[key], a number, as text. */
export function num(holder, key) {
  const value = holder[key];
  if (Number.isInteger(value)) {
    const keys = DECIMALS.get(holder);
    return keys && keys.has(String(key)) ? decimalText(value) : String(value);
  }
  return decimalText(value);
}

// Friendly wording for the standard list-empty-reason codes. Bundles carry the
// reason as a code ("nilknown"), as display text ("Nil Known") or as both, so
// the lookup is keyed on a squashed form that all three spellings collapse into.
export const EMPTY_REASON_LABELS = {
  nilknown: "None known",
  notasked: "Not asked",
  withheld: "Information withheld",
  unavailable: "Unavailable",
  notstarted: "Not started",
  closed: "Closed",
};

/** Lowercase, letters and digits only - "Nil Known" and "nilknown" alike. */
export const squash = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Best human label of a CodeableConcept-shaped value, or null. */
export function ccDisplay(cc) {
  if (!isObj(cc)) return null;
  if (text(cc.text)) return text(cc.text);
  if (Array.isArray(cc.coding)) {
    for (const key of ["display", "code"]) {
      for (const coding of cc.coding) {
        if (isObj(coding) && text(coding[key])) return text(coding[key]);
      }
    }
  }
  return null;
}

/** UCUM as people write it: the micro sign for "u", a power of ten as one
 * ("10*9/L"), and an annotation ("{1.73_m2}") without its braces. */
function unitText(unit) {
  unit = unit.replace(/\{([^}]*)\}/g, (_, inner) => inner.replaceAll("_", " "));
  unit = unit.replace(/\b10\*(\d+)/g, "\u00d710^$1");
  return unit.replace(/(?<![A-Za-z])u(?=(?:g|mol|L|kat|m|s)\b)/g, "\u00b5");
}

export function quantityStr(quantity, bare = false) {
  if (!isObj(quantity) || !isNum(quantity.value)) return null;
  let unit = bare ? "" : quantity.unit;
  if (!isStr(unit)) unit = isStr(quantity.code) ? quantity.code : "";
  // "<5 mg/L" is a different result from "5 mg/L": below the assay's limit,
  // not a measured 5.
  const comparator = ["<", "<=", ">=", ">"].includes(quantity.comparator)
    ? quantity.comparator : "";
  return `${comparator}${num(quantity, "value")} ${unitText(unit)}`.trim();
}

/** 1:64 for a titre; "5 mg / 1 mL" when the parts carry units. */
export function ratioStr(ratio) {
  if (!isObj(ratio)) return null;
  const top = quantityStr(ratio.numerator);
  const bottom = quantityStr(ratio.denominator);
  if (!(top && bottom)) return null;
  return (top + bottom).includes(" ") ? `${top} / ${bottom}` : `${top}:${bottom}`;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function rangeStr(range) {
  if (!isObj(range)) return null;
  const { low, high } = range;
  let lowText = quantityStr(low);
  const highText = quantityStr(high);
  if (lowText && highText) {
    // One unit is enough when both ends share it: "2-4 mmol/L".
    if (same(low.unit, high.unit) && same(low.code, high.code)) lowText = quantityStr(low, true);
    return `${lowText}-${highText}`;
  }
  if (lowText) return `>=${lowText}`;
  if (highText) return `<=${highText}`;
  return null;
}

export function periodStr(period) {
  if (!isObj(period)) return null;
  const start = isStr(period.start) ? period.start : null;
  const end = isStr(period.end) ? period.end : null;
  if (start && end) return `${start} to ${end}`;
  return start || end;
}

export function firstStr(resource, ...keys) {
  for (const key of keys) {
    if (text(resource[key])) return text(resource[key]);
  }
  return null;
}

/** A FHIR choice element like onset[x] / performed[x] / effective[x]. */
export function choiceStr(resource, prefix) {
  return firstStr(resource, prefix + "DateTime", prefix + "String", prefix + "Date")
    || periodStr(resource[prefix + "Period"])
    || quantityStr(resource[prefix + "Age"])
    || quantityStr(resource[prefix + "Quantity"]);
}

/** The value[x] of an Observation or one of its components, as text. */
export function valueStr(holder) {
  const value = quantityStr(holder.valueQuantity)
    || ccDisplay(holder.valueCodeableConcept)
    || firstStr(holder, "valueString", "valueDateTime", "valueTime")
    || ratioStr(holder.valueRatio)
    || rangeStr(holder.valueRange)
    || periodStr(holder.valuePeriod);
  if (value) return value;
  if (typeof holder.valueBoolean === "boolean") return holder.valueBoolean ? "yes" : "no";
  if (Number.isInteger(holder.valueInteger) && !num(holder, "valueInteger").includes(".")) {
    return String(holder.valueInteger);
  }
  // A waveform has no one-line rendering, but it is a value all the same.
  if (isObj(holder.valueSampledData)) return "sampled data";
  return null;
}

export function observationValue(obs) {
  const value = valueStr(obs);
  if (value) return value;
  const parts = [];
  for (const comp of list(obs.component)) {
    if (!isObj(comp)) continue;
    const label = ccDisplay(comp.code);
    const val = valueStr(comp);
    if (label && val) parts.push(`${label} ${val}`);
    else if (val) parts.push(val);
  }
  return parts.length ? parts.join(", ") : null;
}

/** Map fullUrl, its trailing "Type/id" segment, and "resourceType/id" to each
 * entry's resource, so section references resolve in every style. */
export function buildReferenceIndex(entries) {
  const byRef = new Map();
  for (const entry of entries) {
    const resource = entry.resource;
    const keys = [];
    const full = entry.fullUrl;
    if (isStr(full) && full) {
      keys.push(full);
      const m = /([A-Za-z]+\/[A-Za-z0-9\-.]{1,64})$/.exec(full);
      if (m) keys.push(m[1]);
    }
    if (isStr(resource.resourceType) && isStr(resource.id)) {
      keys.push(`${resource.resourceType}/${resource.id}`);
    }
    for (const key of keys) if (!byRef.has(key)) byRef.set(key, resource);
  }
  return byRef;
}

export const resolveReference = (ref, byRef) =>
  (isStr(ref) && ref && byRef.has(ref) ? byRef.get(ref) : null);

export function containedResource(resource, localId) {
  for (const res of list(resource.contained)) {
    if (isObj(res) && res.id === localId) return res;
  }
  return null;
}

/** What a reference inside `resource` points at: a contained resource for
 * "#id", else an entry of the bundle. */
export function referenceTarget(resource, ref, byRef) {
  return isStr(ref) && ref.startsWith("#")
    ? containedResource(resource, ref.slice(1))
    : resolveReference(ref, byRef);
}

export function medicationName(resource, byRef) {
  const name = ccDisplay(resource.medicationCodeableConcept);
  if (name) return name;
  const medRef = resource.medicationReference;
  if (isObj(medRef)) {
    const target = referenceTarget(resource, medRef.reference, byRef);
    if (isObj(target) && ccDisplay(target.code)) return ccDisplay(target.code);
    if (text(medRef.display)) return text(medRef.display);
  }
  return "Medication (unnamed)";
}

const TIMING_UNITS = { s: "second", min: "minute", h: "hour", d: "day",
  wk: "week", mo: "month", a: "year" };

// The common v3 TimingEvent codes in words; anything else shows as its code.
const TIMING_EVENTS = {
  MORN: "morning", "MORN.early": "early morning", "MORN.late": "late morning",
  NOON: "noon", AFT: "afternoon", "AFT.early": "early afternoon",
  "AFT.late": "late afternoon", EVE: "evening", "EVE.early": "early evening",
  "EVE.late": "late evening", NIGHT: "night", PHS: "after sleep",
  HS: "before sleep", WAKE: "on waking", C: "with a meal",
  CM: "with breakfast", CD: "with lunch", CV: "with dinner",
  AC: "before a meal", ACM: "before breakfast", ACD: "before lunch",
  ACV: "before dinner", PC: "after a meal", PCM: "after breakfast",
  PCD: "after lunch", PCV: "after dinner",
};

/** Timing.repeat as phrases: "2x per day", "every 4-6 hours", "for 42 days". */
function timingRepeatBits(repeat) {
  const has = (key) => isNum(repeat[key]);
  const strings = (key) => list(repeat[key]).filter(isStr);
  const bits = [];
  const unit = repeat.periodUnit;
  if (has("period") && lookup(TIMING_UNITS, unit)) {
    const word = TIMING_UNITS[unit];
    // "4 hours", "4-6 hours", or "day" for a bare 1 of the unit.
    let span;
    if (has("periodMax")) span = `${num(repeat, "period")}-${num(repeat, "periodMax")} ${word}s`;
    else span = repeat.period === 1 ? word : `${num(repeat, "period")} ${word}s`;
    if ((!has("frequency") || repeat.frequency === 1) && !has("frequencyMax")) {
      bits.push(`every ${span}`);
    } else {
      const freq = has("frequency") ? num(repeat, "frequency") : "None";
      const times = has("frequencyMax") ? `${freq}-${num(repeat, "frequencyMax")}` : freq;
      bits.push(`${times}x per ${span}`);
    }
  }
  if (strings("dayOfWeek").length) bits.push("on " + strings("dayOfWeek").join(", "));
  if (strings("timeOfDay").length) {
    bits.push("at " + strings("timeOfDay").map((t) => t.slice(0, 5)).join(", "));
  }
  for (const event of strings("when")) bits.push(lookup(TIMING_EVENTS, event, event));
  const bounds = repeat.boundsDuration;
  if (isObj(bounds) && isNum(bounds.value)) {
    const word = lookup(TIMING_UNITS, bounds.code);
    if (word) {
      bits.push(bounds.value === 1 ? `for 1 ${word}` : `for ${num(bounds, "value")} ${word}s`);
    } else if (quantityStr(bounds)) {
      bits.push("for " + quantityStr(bounds));
    }
  }
  const window = repeat.boundsPeriod;
  if (isObj(window)) {
    const start = firstStr(window, "start");
    const end = firstStr(window, "end");
    if (start && end) bits.push(`from ${start} to ${end}`);
    else if (start || end) bits.push(start ? `from ${start}` : `until ${end}`);
  }
  return bits;
}

export function dosageDetail(resource) {
  let dosages = resource.dosage;
  if (!Array.isArray(dosages)) dosages = resource.dosageInstruction;
  if (!Array.isArray(dosages)) return null;
  const parts = [];
  for (const dosage of dosages) {
    if (!isObj(dosage)) continue;
    const written = firstStr(dosage, "text");
    if (written) {
      parts.push(written);
      continue;
    }
    // No text: a prescription is often structured only ("4 Tablet, every
    // day, late evening, for 42 days"), and that is a dose all the same.
    const bits = [];
    for (const rate of list(dosage.doseAndRate)) {
      if (!isObj(rate)) continue;
      const dose = quantityStr(rate.doseQuantity) || rangeStr(rate.doseRange);
      // UCUM annotations ("{tbl}") are units only to a machine.
      if (dose) bits.push(dose.replace(/\{([^{}]*)\}/g, "$1"));
      const speed = quantityStr(rate.rateQuantity) || ratioStr(rate.rateRatio)
        || rangeStr(rate.rateRange);
      if (speed) bits.push(`at ${speed}`);
    }
    const route = ccDisplay(dosage.route);
    if (route) bits.push(route);
    const timing = dosage.timing;
    if (isObj(timing)) {
      const when = ccDisplay(timing.code);
      if (when) bits.push(when);
      if (isObj(timing.repeat)) bits.push(...timingRepeatBits(timing.repeat));
    }
    const need = ccDisplay(dosage.asNeededCodeableConcept);
    if (need) bits.push(`as needed for ${need}`);
    else if (dosage.asNeededBoolean === true) bits.push("as needed");
    if (bits.length) parts.push(bits.join(", "));
  }
  return parts.join("; ") || null;
}

export const humanizeType = (rtype) => rtype.replace(/(?<=[a-z0-9])(?=[A-Z])/g, " ");

export function extensions(resource, url) {
  return list(resource.extension).filter((ext) => isObj(ext) && ext.url === url);
}

// Code systems a clinician recognises by name; anything else falls back to the
// system's host so provenance is still visible.
const CODE_SYSTEM_LABELS = {
  "http://snomed.info/sct": "SNOMED CT",
  "http://loinc.org": "LOINC",
  "http://www.whocc.no/atc": "ATC",
  "http://hl7.org/fhir/sid/icd-10": "ICD-10",
  "http://hl7.org/fhir/sid/icd-10-cm": "ICD-10-CM",
  "http://hl7.org/fhir/sid/icd-11": "ICD-11",
  "http://www.nlm.nih.gov/research/umls/rxnorm": "RxNorm",
  "http://hl7.org/fhir/sid/ndc": "NDC",
  "http://unitsofmeasure.org": "UCUM",
  "http://hl7.org/fhir/sid/cvx": "CVX",
  "http://ec.europa.eu/tools/mdr": "EU MDR",
};

export function codeSystemLabel(system) {
  if (!text(system)) return null;
  system = system.trim();
  const known = lookup(CODE_SYSTEM_LABELS, system.replace(/\/+$/, ""));
  if (known) return known;
  if (system.startsWith("urn:oid:")) return "OID " + system.slice("urn:oid:".length);
  const host = /^(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\/([^/?#]*)/.exec(system);
  return (host && host[1]) || system;
}

/** [system label, code] of the first usable coding in a CodeableConcept. */
export function conceptCoding(cc) {
  if (!isObj(cc) || !Array.isArray(cc.coding)) return [null, null];
  for (const coding of cc.coding) {
    if (isObj(coding) && text(coding.code)) {
      return [codeSystemLabel(coding.system), text(coding.code)];
    }
  }
  return [null, null];
}

/** Every human label a CodeableConcept carries, for word matching. */
export function conceptWords(concept) {
  if (!isObj(concept)) return "";
  const labels = [concept.text];
  for (const coding of list(concept.coding)) if (isObj(coding)) labels.push(coding.display);
  return labels.filter(isStr).join(" | ");
}

// XHTML 1.0 named character references, which FHIR narrative may use.
const ENTITIES = (() => {
  const table = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const runs = [
    [160, "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml"],
    [913, "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho"],
    [931, "Sigma Tau Upsilon Phi Chi Psi Omega"],
    [945, "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega"],
  ];
  for (const [start, names] of runs) {
    names.split(" ").forEach((name, i) => { table[name] = String.fromCodePoint(start + i); });
  }
  const single = {
    OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, fnof: 402, circ: 710,
    tilde: 732, thetasym: 977, upsih: 978, piv: 982, ensp: 8194, emsp: 8195, thinsp: 8201,
    zwnj: 8204, zwj: 8205, lrm: 8206, rlm: 8207, ndash: 8211, mdash: 8212, lsquo: 8216,
    rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, dagger: 8224,
    Dagger: 8225, bull: 8226, hellip: 8230, permil: 8240, prime: 8242, Prime: 8243,
    lsaquo: 8249, rsaquo: 8250, oline: 8254, frasl: 8260, euro: 8364, image: 8465,
    weierp: 8472, real: 8476, trade: 8482, alefsym: 8501, larr: 8592, uarr: 8593,
    rarr: 8594, darr: 8595, harr: 8596, crarr: 8629, lArr: 8656, uArr: 8657, rArr: 8658,
    dArr: 8659, hArr: 8660, forall: 8704, part: 8706, exist: 8707, empty: 8709,
    nabla: 8711, isin: 8712, notin: 8713, ni: 8715, prod: 8719, sum: 8721, minus: 8722,
    lowast: 8727, radic: 8730, prop: 8733, infin: 8734, ang: 8736, and: 8743, or: 8744,
    cap: 8745, cup: 8746, int: 8747, there4: 8756, sim: 8764, cong: 8773, asymp: 8776,
    ne: 8800, equiv: 8801, le: 8804, ge: 8805, sub: 8834, sup: 8835, nsub: 8836,
    sube: 8838, supe: 8839, oplus: 8853, otimes: 8855, perp: 8869, sdot: 8901,
    lceil: 8968, rceil: 8969, lfloor: 8970, rfloor: 8971, lang: 9001, rang: 9002,
    loz: 9674, spades: 9824, clubs: 9827, hearts: 9829, diams: 9830,
  };
  for (const [name, code] of Object.entries(single)) table[name] = String.fromCodePoint(code);
  return table;
})();

function unescapeHtml(s) {
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body) => {
    if (body[0] !== "#") return lookup(ENTITIES, body, whole);
    const hex = body[1] === "x" || body[1] === "X";
    if (!hex && !/^#\d+$/.test(body)) return whole;
    const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!(code > 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return "\ufffd";
    return String.fromCodePoint(code);
  });
}

/** The section's own narrative as plain text, for a section that is its
 * narrative - a patient story has no entries, and "No entries" would be the
 * wrong thing to say about it. */
export function sectionNarrative(section) {
  const div = isObj(section.text) ? section.text.div : null;
  if (!isStr(div)) return null;
  // Paragraph and row ends become line breaks so the prose keeps its shape;
  // every other tag goes.
  let plain = div.replace(/<\/(p|tr|div|li|h[1-6])\s*>/gi, "\n");
  plain = unescapeHtml(plain.replace(/<[^>]+>/g, " "));
  const lines = plain.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/).map(words);
  return lines.filter(Boolean).join("\n") || null;
}

const ISO_DAY_AT_START = /^\d{4}-\d{2}-\d{2}(?!\d)/;
export const ISO_DAY = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;

/** The calendar day a FHIR date or dateTime starts with, as [year, month,
 * day], or null when it is partial, malformed or not a real date. */
export function isoDay(value) {
  if (!isStr(value) || !ISO_DAY_AT_START.test(value)) return null;
  const [y, m, d] = [value.slice(0, 4), value.slice(5, 7), value.slice(8, 10)].map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return null;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const length = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d > length ? null : [y, m, d];
}

/** Days since 0001-01-01, for day arithmetic on isoDay() values. */
export function dayNumber([y, m, d]) {
  const date = new Date(Date.UTC(2000, m - 1, d));
  date.setUTCFullYear(y);
  return Math.round(date.getTime() / 86400000);
}
