// The three renderings of a summary, as HTML strings. Lifted from Provbana's
// page (github.com/vadi2/Provbana), which is where the wording and the rules
// about what is shown first were worked out.
import { DOCUMENT_TYPES } from "./summarize.js";

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const DOC_LABELS = Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.id, d.longLabel]));
export const docLabel = (id) => DOC_LABELS[id] || id;

// The day ages and "upcoming" are counted from when the document carries no
// date of its own; set for the length of one render.
let today = "";

function cvItemHtml(item) {
  // the status pill already says "active"; a flag chip repeating it is noise -
  // unless the chip is a risk ("cancelled"), then the chip stays and the pill goes
  const loud = RISK_FLAGS.indexOf(item.status) !== -1 && hasFlag(item, item.status);
  const chips = item.status && !loud
    ? cvChips(Object.assign({}, item,
        { flags: (item.flags || []).filter((f) => f !== item.status) }))
    : cvChips(item);
  const detail = cvDetailText(item);
  const basis = cvBasis(item);
  const ref = cvResultRef(item);
  return "<li>"
    + '<span class="cv-label">' + cvName(item) + "</span>"
    + (item.status && !loud && !routineStatus(item, item.status)
        ? '<span class="cv-status">' + esc(statusWord(item)) + "</span>" : "")
    + chips
    + (basis ? '<span class="cv-basis">' + esc(basis) + "</span>" : "")
    + (detail ? '<div class="cv-detail muted">' + esc(detail) + "</div>" : "")
    + (ref.length ? '<div class="cv-detail muted">' + ref.map(esc).join(" &middot; ")
        + "</div>" : "")
    + cvDatesHtml(item)
    + cvCoversHtml(item, "cv-detail muted")
    + cvOwnerHtml(item, "cv-detail muted")
    + cvStepsHtml(item)
    + (item.note ? '<div class="cv-note muted">' + esc(item.note) + "</div>" : "")
    + "</li>";
}

/* A detail segment that is only a date phrase ("onset 2012-09-04", or a bare
   date) gives way to the dates line, which names every date with its kind. */
function cvDetailText(item) {
  const vals = (item.dates || []).map((x) => String(x.value));
  return String(item.detail || "").split("; ").filter((seg) => {
    // the chip already says it
    if (hasFlag(item, seg) || (seg === "criticality high" && hasFlag(item, "high risk"))) {
      return false;
    }
    const v = vals.find((x) => x && seg.endsWith(x));
    return !(v !== undefined && /^[A-Za-z ]*$/.test(seg.slice(0, seg.length - v.length)));
  }).join("; ");
}

/* Onset, recording, plan start and the event itself are different facts, so
   each date is printed with its kind; one the detail still names is not repeated. */
function cvDateParts(item) {
  const detail = cvDetailText(item);
  return (item.dates || []).filter((x) => detail.indexOf(x.value) === -1)
    .map((x) => (x.kind ? cvKind(item, x.kind) + " " : "") + shortDate(x.value));
}
function cvDatesHtml(item) {
  const parts = cvDateParts(item);
  return parts.length
    ? '<div class="cv-detail muted">' + parts.map(esc).join(" &middot; ") + "</div>"
    : "";
}

/* Prescribed, dispensed, given and "says they take it" are not the same claim. */
const cvBasis = (i) => (i.category !== "medication" || !i.basis) ? ""
  : (i.basis === "stated as taking" && isEnded(i) ? "stated as taken" : i.basis);
const cvOwnerText = (i) => [i.owner, i.owner_phone].filter(Boolean).join(" · ");
function cvOwnerHtml(i, cls) {
  return i.category === "plan" && i.owner
    ? '<div class="' + cls + '">responsible: ' + esc(cvOwnerText(i)) + "</div>" : "";
}
/* The short name is what gets read; the full coded one stays a hover away. */
function cvName(i, fallback) {
  const full = i.label || fallback || "Unnamed item";
  return i.short && i.short !== full
    ? '<span title="' + esc(full) + '">' + esc(i.short) + "</span>" : esc(full);
}
/* Workflow codes in plain words; a medicine that is "completed" was stopped. */
const STATUS_WORDS = { "in-progress": "ongoing", "not-started": "not started",
  "on-hold": "on hold", scheduled: "planned", "not-taken": "not taken",
  "entered-in-error": "entered in error" };
function statusWord(i, status) {
  const st = String(status === undefined ? (i && i.status) || "" : status || "");
  if (i && i.category === "medication" && i.basis !== "given" && st === "completed") {
    return "stopped";
  }
  return STATUS_WORDS[st] || st;
}
/* "taking since 2021" on a medicine that was stopped in 2023 reads as current. */
const cvKind = (i, kind) => kind === "taking since" && isEnded(i) ? "taken from" : kind;
/* The steps of a plan are the plan: one line for a status they all share,
   otherwise a status per step. */
function cvStepsHtml(i, cls) {
  const steps = i.steps || [];
  if (!steps.length) return "";
  const states = steps.map((x) => x.status || "");
  const same = states.every((x) => x === states[0]);
  return '<div class="cv-steps' + (cls ? " " + cls : "") + '">'
    + '<div class="cv-steps-head">' + esc(cvStepsLine(i)) + "</div><ol>"
    + steps.map((x) => "<li>" + esc(x.text || "Unnamed step")
        + (x.scheduled ? ' <span class="cv-sub">' + esc(shortDate(x.scheduled)) + "</span>" : "")
        + (!same && x.status ? '<span class="cv-status">'
            + esc(statusWord(null, x.status)) + "</span>" : "")
        + "</li>").join("")
    + "</ol></div>";
}
function cvStepsLine(i) {
  const steps = i.steps || [];
  const states = steps.map((x) => x.status || "");
  const same = states.every((x) => x === states[0]);
  return plural(steps.length, "step") + (same && states[0]
    ? " - " + (steps.length > 1 ? "all " : "") + statusWord(null, states[0]) : "");
}
const cvCoversHtml = (i, cls) => (i.covers || []).length
  ? '<div class="' + cls + '">Covers: ' + i.covers.map(esc).join(" &middot; ") + "</div>"
  : "";
/* A result without its reference range and its laboratory is half a result. */
const cvResultRef = (i) => i.category !== "result" ? []
  : [i.range ? "reference " + i.range : "", i.performer || ""].filter(Boolean);
/* One laboratory behind every result is said once, not on every row. */
function cvSharedPerformer(arr) {
  const res = (arr || []).filter((i) => i.category === "result" && !i.assertion);
  return res.length > 1 && res[0].performer
    && res.every((i) => i.performer === res[0].performer) ? res[0].performer : "";
}
const cvDropPerformer = (arr) => arr.map((i) => i.category === "result"
  ? Object.assign({}, i, { performer: "" }) : i);
const INFERRED_RISK = "Marked high risk by this view from the diagnosis, not by the author.";
const inferredRisk = (i) => i.category === "problem" && hasFlag(i, "high risk");

/* ---- shared helpers for the clinician renderings ---- */
const CAT_LABEL = { alert: "Alert", allergy: "Allergy", problem: "Problem",
  medication: "Medicine", result: "Result", procedure: "Procedure",
  immunization: "Vaccination", plan: "Care plan", device: "Device", other: "Other" };
const CAT_ORDER = ["alert", "allergy", "problem", "medication", "result", "procedure",
  "immunization", "device", "plan", "other"];
const RISK_FLAGS = ["high risk", "high priority", "severe", "abnormal", "anticoagulant",
  "insulin", "cancelled", "safety plan", "plan for alert"];
/* What has to be seen whatever the view, the sort order or the year. */
const CRITICAL_FLAGS = ["high priority", "high risk", "severe", "anticoagulant", "insulin",
  "safety plan", "plan for alert"];
const isCritical = (i) => !i.assertion
  && (i.flags || []).some((f) => CRITICAL_FLAGS.indexOf(f) !== -1);
/* Clinical relevance, not list order: critical first, then abnormal or
   active, then the rest - stable, so the author's order breaks ties. */
function relevance(i) {
  if (isCritical(i)) return 0;
  if (hasFlag(i, "abnormal")) return 1;
  if (hasFlag(i, "active") || hasFlag(i, "planned")) return 2;
  return 3;
}
function byRelevance(arr) {
  return arr.map((it, n) => [it, n])
    .sort((a, b) => relevance(a[0]) - relevance(b[0]) || a[1] - b[1])
    .map((x) => x[0]);
}
/* The three states an empty section can be in, kept apart. */
const STATE_TEXT = {
  "stated-none": "Stated by the author as none known.",
  "none-known": "Recorded as none known - which does not show that anyone asked.",
  missing: "Information missing - neither data nor a statement about it.",
};
/* Absent sections the "outdated or missing" box has not already named. */
function cvAbsentRest(s) {
  const said = [];
  (s.attention || []).forEach((a) => (a.sections || []).forEach((c) => said.push(c)));
  const absent = (s.coverage || []).filter((c) => c.state === "absent"
    && c.applicable !== false);
  return { rest: absent.filter((c) => said.indexOf(c.code) === -1),
           also: absent.some((c) => said.indexOf(c.code) !== -1) };
}
const datedText = (i) => i.date
  ? (i.date_kind ? cvKind(i, i.date_kind) + " " : "") + shortDate(i.date) : "";

/* Split deliberately: a resource the document never references is not part of
   any section, so counting it under one contradicts that section's own
   emptyReason assertion. Views that show everything use cvItems; views that
   speak for a section use cvSectionItems and surface orphans separately. */
function cvSectionItems(s) {
  const out = [];
  (s.sections || []).forEach((sec) => (sec.items || []).forEach((it) =>
    out.push(Object.assign({ section: sec.title || "Untitled section" }, it))));
  return out;
}
function cvOrphans(s) {
  return (s.unreferenced || []).map((it) =>
    Object.assign({ section: null, orphan: true }, it));
}
function cvItems(s) {
  return cvSectionItems(s).concat(cvOrphans(s));
}
const cvCat = (items, cat) => items.filter((i) => i.category === cat);
const hasFlag = (it, f) => (it.flags || []).indexOf(f) !== -1;
const hasGap = (it, g) => (it.gaps || []).indexOf(g) !== -1;
const countGap = (arr, g) => arr.filter((i) => hasGap(i, g)).length;
const plural = (n, one, many) => n + " " + (n === 1 ? one : (many || one + "s"));
const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const shortDate = (dt) => String(dt || "").slice(0, 10);

/* A status that only repeats what the date already says is left out. */
function routineStatus(i, status) {
  const st = String(status || "").toLowerCase();
  return st === String(i.date_kind || "").toLowerCase()
    || (i.category === "result" && st === "final")
    || ((i.category === "immunization" || i.category === "procedure"
         || i.basis === "given") && st === "completed");
}
/* The chip says what the document says: which way a result is off, and
   "criticality" where that is the author's word for an allergy. */
function cvChipText(i, f) {
  if (f === "abnormal" && i.direction) return i.direction;
  if (f === "high risk" && i.category === "allergy") return "high criticality";
  if (f === "plan for alert") return "plan for a high-priority alert";
  return f;
}
function cvChips(i) {
  let h = "";
  const label = String(i.label || "").toLowerCase();
  (i.flags || []).filter((f) => !routineStatus(i, f)
    && !(f === "safety plan" && label.indexOf(f) !== -1)).forEach((f) => {
    const kind = RISK_FLAGS.indexOf(f) !== -1 ? "risk" : (f === "active" ? "ok" : "warn");
    h += '<span class="chip cvc ' + kind + '"'
      + (f === "high risk" && inferredRisk(i) ? ' title="' + esc(INFERRED_RISK) + '"' : "")
      + ">" + esc(cvChipText(i, f)) + "</span>";
  });
  if (i.verification && i.verification.toLowerCase() !== "confirmed") {
    h += '<span class="chip cvc warn">' + esc(i.verification) + "</span>";
  }
  (i.gaps || []).forEach((g) => {
    h += '<span class="chip cvc gap">' + esc(g) + "</span>";
  });
  return h;
}

/* A status that says the entry is over: pinned still, but not "applies today". */
const ENDED_STATUS = ["completed", "stopped", "resolved", "inactive", "cancelled",
  "ended", "not-taken", "entered-in-error"];
const isEnded = (i) => ENDED_STATUS.indexOf(String(i.status || "").toLowerCase()) !== -1;

/* When an anticoagulant or insulin was last taken decides what can be done
   now, so its absence is said rather than left to be noticed. Where doses are
   recorded but none matches this medicine, the line is left out, not guessed. */
function cvLastDoseHtml(i, doses) {
  if (i.category !== "medication" || hasFlag(i, "last dose")) return "";
  const same = doses.find((x) => (i.code && x.code === i.code)
    || (i.label && x.label === i.label));
  if (same) {
    return '<div class="cv-sub">Last dose: '
      + (same.date ? esc(shortDate(same.date)) : "recorded without a date") + "</div>";
  }
  return doses.length ? ""
    : '<div class="cv-sub cv-crit-gap">Last dose: not recorded</div>';
}

/* What an anticoagulant dose is checked against, or that it cannot be. */
function cvDosingHtml(i, s) {
  if (i.category !== "medication" || !hasFlag(i, "anticoagulant")
      || hasFlag(i, "last dose") || isEnded(i)) return "";
  const d = s.dosing || {};
  const line = (k, v) => v
    ? '<div class="cv-sub">' + k + ": " + esc([v.name, v.value].filter(Boolean).join(" "))
      + (v.direction ? " (" + esc(v.direction) + ")" : "")
      + (v.date ? " &middot; " + esc(shortDate(v.date)) : "") + "</div>"
    : '<div class="cv-sub cv-crit-gap">' + k + ": not in this document</div>";
  return line("Renal function", d.renal) + line("Weight", d.weight);
}
/* A pinned plan nobody can be rung about says so. */
function cvPlanContactGap(i) {
  if (i.category !== "plan" || i.owner_phone) return "";
  const text = [i.note || ""].concat((i.steps || []).map((x) => x.text || "")).join(" ")
    .replace(/\d{4}-\d{2}-\d{2}/g, "");
  return /\+?\d[\d\s-]{6,}\d/.test(text) ? ""
    : '<div class="cv-sub cv-crit-gap">No contact details in this plan</div>';
}
function cvCriticalHtml(s) {
  const all = cvItems(s);
  const pinned = all.filter(isCritical);
  // a diagnosis a pinned alert already names is said once, under the alert
  const covered = [];
  pinned.filter((i) => i.category === "alert").forEach((i) =>
    (i.covers || []).forEach((c) => covered.push(c)));
  const crit = byRelevance(pinned.filter((i) =>
    !(i.category === "problem" && covered.indexOf(i.label) !== -1)));
  const doses = all.filter((i) => i.category === "medication" && hasFlag(i, "last dose"));
  const cov = s.coverage || [];
  const allergy = cov.find((c) => c.code === "48765-2");
  const lines = crit.map((i) => {
    const when = cvDateParts(i);
    const basis = cvBasis(i);
    // "prescribed 2020-01-01" already says the basis
    const said = when.some((x) => x.indexOf(basis + " ") === 0);
    const sub = [cvDetailText(i), said ? "" : basis].concat(when).filter(Boolean);
    return "<li>"
      + '<span class="cv-crit-cat">' + esc(CAT_LABEL[i.category] || "Entry") + "</span> "
      + "<strong>" + cvName(i) + "</strong>" + cvChips(i)
      + (isEnded(i) ? '<span class="cv-status">' + esc(statusWord(i)) + "</span>" : "")
      + (sub.length ? '<div class="cv-sub">' + sub.map(esc).join(" &middot; ") + "</div>" : "")
      + (inferredRisk(i) ? '<div class="cv-sub">' + esc(INFERRED_RISK) + "</div>" : "")
      + cvCoversHtml(i, "cv-sub")
      + cvLastDoseHtml(i, doses)
      + cvDosingHtml(i, s)
      + cvOwnerHtml(i, "cv-sub")
      + cvPlanContactGap(i)
      + cvStepsHtml(i)
      + (i.note ? '<div class="cv-sub cv-note">' + esc(i.note) + "</div>" : "")
      + "</li>";
  });
  if (allergy && (allergy.state === "missing" || allergy.state === "absent")) {
    lines.push('<li><span class="cv-crit-cat">Allergy</span> <strong>Allergy'
      + " status unknown</strong>"
      + '<div class="cv-sub">No allergy and no statement that none is known.</div></li>');
  }
  const attention = (s.attention || []).map((a) => "<li>"
    + "<strong>" + esc(a.title || "Check") + "</strong>"
    + (a.date && ((a.title || "") + (a.detail || "")).indexOf(shortDate(a.date)) === -1
        ? ' <span class="cv-att-date">' + esc(shortDate(a.date)) + "</span>" : "")
    + (a.detail ? '<div class="cv-sub">' + esc(a.detail) + "</div>" : "")
    + "</li>");
  if (!lines.length && !attention.length) return "";
  return '<div class="cv-pinned">'
    + (lines.length
        ? '<div class="cv-critical"><div class="cv-crit-head">Critical</div><ul>'
          + lines.join("") + "</ul></div>" : "")
    + (attention.length
        ? '<div class="cv-attention"><div class="cv-crit-head">Missing and possibly'
          + " outdated</div><ul>" + attention.join("") + "</ul></div>" : "")
    + "</div>";
}

function cvAge(birth, on) {
  if (!birth) return null;
  const b = new Date(shortDate(birth));
  const ref = new Date(shortDate(on || today));
  if (isNaN(b.getTime()) || isNaN(ref.getTime())) return null;
  let a = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

function cvPatientMeta(p, on) {
  const age = cvAge(p.birth_date, on);
  return [age !== null ? age + " years" : null, p.gender ? esc(p.gender) : null,
          p.birth_date ? "born " + esc(shortDate(p.birth_date)) : null]
    .filter(Boolean).join(" &middot; ");
}

/* "en" -> "English". The browser knows every BCP-47 name, so no table here
   can fall behind; a code it cannot read is shown as written. */
function languageName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch (e) {
    return code;
  }
}

/* Who wrote it and whom to ring: asked for before anything in the document
   is acted on, so above the three views rather than inside one of them. */
function cvContextHtml(s) {
  const lines = [];
  const src = s.source;
  if (src) {
    const who = (src.authors || []).concat(src.organization
      ? [src.organization + (src.country ? " (" + src.country + ")" : "")] : []);
    if (who.length) {
      lines.push("<strong>Source:</strong> " + who.map(esc).join(" &middot; "));
    }
  }
  /* Two different languages, and a bare "Language:" reads as the document's:
     a Swedish patient's discharge report written in English said "Language:
     Swedish" above English text. One is what to speak to the patient in, the
     other what the document is written in, so each says which it is. */
  const p = s.patient || {};
  if ((p.languages || []).length) {
    lines.push("<strong>Patient speaks:</strong> " + p.languages.map(esc).join(", "));
  }
  const written = (s.composition || {}).language;
  if (written) {
    lines.push("<strong>Document language:</strong> " + esc(languageName(written)));
  }
  (p.contacts || []).forEach((c) => {
    lines.push("<strong>" + esc(c.relationship || "Contact") + ":</strong> "
      + [c.name, c.phone, c.place].filter(Boolean).map(esc).join(" &middot; "));
  });
  if (s.patient && !(p.contacts || []).length) {
    lines.push('<strong>Emergency contact:</strong> <span class="cv-crit-gap">none'
      + " recorded in this document</span>");
  }
  (s.care_teams || []).forEach((t) => {
    const members = (t.members || []).map((m) => esc(m.name || "Unnamed")
      + (m.role ? " (" + esc(m.role) + ")" : "") + (m.phone ? " " + esc(m.phone) : ""));
    const own = t.phone && !(t.members || []).some((m) => m.phone === t.phone);
    lines.push("<strong>" + esc(t.name || "Care team") + ":</strong> "
      + (own ? [esc(t.phone)] : []).concat(members).join(" &middot; ")
      + (t.note ? '<br><span class="cv-sub">' + esc(t.note) + "</span>" : ""));
  });
  return lines.length ? '<p class="cv-context">' + lines.join("<br>") + "</p>" : "";
}

/* The honest last line: what the technical checks do and do not show. */
function cvQualityHtml(s, mode) {
  const q = s.quality || {};
  const total = q.items || 0;
  const hasPlans = cvItems(s).some((i) => i.category === "plan" && !i.assertion);
  let text = "";
  if (total) {
    text = (q.coded === total && q.dated === total
      ? "All " + plural(total, "included entry", "included entries") + " "
        + (total === 1 ? "has" : "have") + " a code and a date."
      : "Of " + plural(total, "included entry", "included entries") + ", "
        + (q.coded || 0) + " have a code and " + (q.dated || 0) + " have a date.")
      + " Currency and clinical completeness have not been assessed.";
  }
  const stated = cvItems(s).filter((i) => !i.assertion
    && (i.category === "problem" || i.category === "allergy"));
  if (stated.length && !stated.some((i) => (i.dates || []).some((x) =>
        /record|assert|verif/.test(x.kind || "")))) {
    text += (text ? " " : "") + "No problem or allergy says when it was recorded or"
      + " last verified.";
  }
  // the dashboard says this on its care plan card
  if (hasPlans && mode !== "dashboard") {
    text += (text ? " " : "") + "The document records what was planned - not that a"
      + " receiving provider or municipality has confirmed the handover.";
  }
  return text ? '<p class="cv-quality">' + esc(text) + "</p>" : "";
}

function sectionFor(sections, kind) {
  return (sections || []).find((x) => x.kind === kind) || null;
}

/* ---- B: clinical timeline ---- */
/* String comparison would sort an unparseable date above every real event,
   silently moving the newest entry off the top of the timeline. */
function tlTime(v) {
  const t = Date.parse(shortDate(v));
  return isNaN(t) ? null : t;
}

/* One row per item at its own date, plus one per date its note names: "no
   readings since 2026-06-02" belongs in June 2026, not under the year the
   device was fitted. */
function tlRows(items) {
  const rows = [];
  items.forEach((i) => {
    const own = [];
    if (tlTime(i.date) !== null) {
      rows.push({ t: tlTime(i.date), date: i.date, item: i });
      own.push(shortDate(i.date));
    }
    // a medicine stopped in 2023 stopped in 2023, not under the year it began
    (i.dates || []).forEach((x) => {
      const day = shortDate(x.value);
      if (x.kind !== "stopped" || tlTime(day) === null || own.indexOf(day) !== -1) return;
      own.push(day);
      rows.push({ t: tlTime(day), date: day, item: i, noted: "", mark: "stopped" });
    });
    (i.note_dates || []).forEach((n) => {
      const day = shortDate(n.value);
      if (tlTime(day) === null || own.indexOf(day) !== -1) return;
      own.push(day);
      rows.push({ t: tlTime(day), date: day, item: i, noted: n.text || "" });
    });
  });
  return rows;
}

function tlRowHtml(r) {
  const i = r.item;
  const cat = esc(CAT_LABEL[i.category] || "Entry");
  if (r.noted !== undefined) {
    return '<div class="tl-row tl-noted c-' + esc(i.category || "other") + '">'
      + '<div class="tl-date">' + esc(shortDate(r.date))
      + " &middot; " + esc(r.mark || "date named in the note") + " &middot; " + cat
      + "</div>"
      + '<div class="tl-label">' + cvName(i) + "</div>"
      + (r.noted ? '<div class="tl-detail tl-note">' + esc(r.noted) + "</div>" : "")
      + "</div>";
  }
  const detail = cvDetailText(i);
  const basis = cvBasis(i);
  const others = (i.dates || []).filter((x) => !(x.value === i.date
    && (x.kind || null) === (i.date_kind || null)) && detail.indexOf(x.value) === -1)
    .map((x) => (x.kind ? cvKind(i, x.kind) + " " : "") + shortDate(x.value));
  const ref = cvResultRef(i);
  return '<div class="tl-row c-' + esc(i.category || "other") + '">'
    + '<div class="tl-date">' + esc(datedText(i)) + " &middot; " + cat
    + (i.status && !routineStatus(i, i.status) ? " &middot; " + esc(statusWord(i)) : "")
    + (basis && basis !== i.date_kind ? " &middot; " + esc(basis) : "")
    + (isCritical(i) && !isEnded(i)
        ? ' &middot; <span class="tl-pin">still applies today</span>' : "")
    + "</div>"
    + '<div class="tl-label">' + cvName(i) + cvChips(i) + "</div>"
    + (detail ? '<div class="tl-detail">' + esc(detail) + "</div>" : "")
    + (ref.length ? '<div class="tl-detail">' + ref.map(esc).join(" &middot; ") + "</div>" : "")
    + (others.length
        ? '<div class="tl-detail">' + others.map(esc).join(" &middot; ") + "</div>" : "")
    + cvCoversHtml(i, "tl-detail")
    + cvOwnerHtml(i, "tl-detail")
    // the pinned box above already lists the steps of a critical plan
    + (isCritical(i) && (i.steps || []).length
        ? '<div class="tl-detail">' + esc(cvStepsLine(i)) + ", listed under Critical</div>"
        : cvStepsHtml(i))
    + (i.note ? '<div class="tl-detail tl-note">' + esc(i.note) + "</div>" : "")
    + "</div>";
}

function viewTimeline(d) {
  const s = d.summary || {};
  const lab = cvSharedPerformer(cvItems(s));
  const items = (lab ? cvDropPerformer(cvItems(s)) : cvItems(s)).filter((i) => !i.assertion);
  const docDate = shortDate(s.as_of || (s.composition || {}).date);
  const hasDoc = tlTime(docDate) !== null;
  const ref = hasDoc ? tlTime(docDate) : tlTime(today);
  const rows = tlRows(items);
  // sort is stable, so entries sharing a day keep the document's order
  const upcoming = rows.filter((r) => r.t > ref).sort((a, b) => a.t - b.t);
  const past = rows.filter((r) => r.t <= ref).sort((a, b) => b.t - a.t);
  const undated = items.filter((i) => tlTime(i.date) === null);
  // entries, not rows: an entry with a second row for a date in its note is one
  const dated = items.length - undated.length;
  const cats = CAT_ORDER.filter((c) => items.some((i) => i.category === c));
  const p = s.patient;
  let h = p ? '<p class="cv-context"><strong>' + esc(p.name || "Unnamed patient")
    + "</strong>" + [cvPatientMeta(p, docDate)].concat((p.identifiers || [])
        .map((i) => esc(i.value))).filter(Boolean).map((x) => " &middot; " + x).join("")
    + "</p>" : "";
  h += '<div class="tl-legend">' + cats.map((c) =>
    '<span class="c-' + esc(c) + '"><i class="cdot"></i>' + esc(CAT_LABEL[c] || c)
    + " (" + cvCat(items, c).length + ")</span>").join("") + "</div>";
  h += '<p class="muted" style="margin:8px 0 0">'
    + plural(dated, "dated entry", "dated entries")
    + (past.length ? ", " + esc(shortDate(past[past.length - 1].date)) + " to "
        + esc(shortDate(past[0].date)) : "")
    + (hasDoc ? " &middot; document date " + esc(docDate)
        : rows.length ? " &middot; no document date, so upcoming is counted from today" : "")
    + (upcoming.length ? " &middot; " + upcoming.length + " upcoming" : "")
    + (undated.length ? " &middot; " + undated.length + " undated" : "")
    + (lab ? " &middot; all results from " + esc(lab) : "") + "</p>";

  if (rows.length) {
    let year = null;
    h += '<div class="tl">';
    if (upcoming.length) {
      h += '<div class="tl-year tl-upcoming">Upcoming</div>'
        + upcoming.map(tlRowHtml).join("");
    }
    past.forEach((r) => {
      const y = shortDate(r.date).slice(0, 4);
      if (y !== year) { year = y; h += '<div class="tl-year">' + esc(y) + "</div>"; }
      h += tlRowHtml(r);
    });
    h += "</div>";
  } else {
    h += '<p class="muted">No entry carries a date, so this document cannot be'
      + " placed on a timeline at all.</p>";
  }

  if (undated.length) {
    h += '<div class="tl-undated"><strong>'
      + plural(undated.length, "entry", "entries") + " with no usable date</strong>"
      + '<p class="muted" style="margin:2px 0 4px;font-size:calc(0.8 * var(--rem))">Present in the'
      + " document but impossible to place in the patient's history.</p>"
      + '<ul class="cv-items">' + undated.map(cvItemHtml).join("") + "</ul></div>";
  }

  const asserted = (s.sections || []).filter((x) =>
    x.state === "stated-none" || x.state === "none-known");
  if (asserted.length) {
    h += '<div class="tl-asserted"><strong>'
      + plural(asserted.length, "section", "sections")
      + " with nothing known to report</strong>"
      + '<p class="muted" style="margin:2px 0 4px;font-size:calc(0.8 * var(--rem))">Nothing to'
      + " place on the timeline. Not the same as information missing, but not"
      + " proof of absence either.</p>"
      + '<ul class="cv-items">' + asserted.map((x) => "<li>"
          + esc(x.title || "Untitled section") + '<span class="chip cvc warn">'
          + (x.state === "stated-none" ? "stated: none known"
              : esc(x.empty_reason || "none known")) + "</span></li>").join("")
      + "</ul></div>";
  }
  return h;
}

/* ---- C: safety dashboard ---- */
function dbCard(title, body, cls) {
  return '<div class="db-card' + (cls ? " " + cls : "") + '"><h4>' + esc(title)
    + "</h4>" + body + "</div>";
}
function dbList(arr, n, fn, cls) {
  return '<ul class="db-list' + (cls ? " " + cls : "") + '">'
    + arr.slice(0, n).map(fn).join("") + "</ul>"
    + (arr.length > n ? '<p class="db-more">and ' + (arr.length - n) + " more</p>" : "");
}
function dbMeter(label, n, total) {
  const v = pctOf(n, total);
  const cls = v >= 90 ? "" : (v >= 60 ? " mid" : " low");
  return '<div class="mt"><div class="mt-top"><span>' + esc(label) + "</span><span>"
    + v + "%</span></div>"
    + '<div class="meter' + cls + '"><span style="width:' + v + '%"></span></div>'
    + '<div class="db-more">' + n + " of " + total + "</div></div>";
}
function dbRow(i) {
  return "<li>" + cvName(i) + cvChips(i)
    + (i.date ? ' <span class="db-more" style="display:inline">'
        + esc(datedText(i)) + "</span>" : "") + "</li>";
}
/* Rows a decision rests on are listed in full up to this many: a diagnosis
   or an anticoagulant folded into "and 4 more" is as good as not sent. */
const DB_FULL = 12;
const dbGap = (g) => '<span class="chip cvc gap">' + esc(g) + "</span>";
function dbChips(i, dropFlags, dropGaps) {
  return cvChips(Object.assign({}, i, {
    flags: (i.flags || []).filter((f) => dropFlags.indexOf(f) === -1),
    gaps: (i.gaps || []).filter((g) => (dropGaps || []).indexOf(g) === -1) }));
}
function dbDates(i) {
  const detail = i.detail || "";
  const all = (i.dates && i.dates.length) ? i.dates
    : (i.date ? [{ kind: i.date_kind, value: i.date }] : []);
  return all.filter((x) => detail.indexOf(shortDate(x.value)) === -1)
    .map((x) => (x.kind ? cvKind(i, x.kind) + " " : "") + shortDate(x.value));
}
/* The dose or value, every date the detail does not name, and the note.
   withStatus spells out the status of an entry that is not active. */
function dbRowHtml(i, withStatus, extra) {
  const meta = [].concat(extra || []).filter(Boolean).concat(cvResultRef(i), dbDates(i));
  return "<li>" + cvName(i)
    + (withStatus ? ' <span class="db-state">- '
        + esc(statusWord(i) || "status not stated") + "</span>" : "")
    + dbChips(i, ["active"])
    + (i.detail ? '<div class="db-detail">' + esc(i.detail) + "</div>" : "")
    + (meta.length ? '<div class="db-more">' + meta.map(esc).join(" &middot; ")
        + "</div>" : "")
    + (i.note ? '<div class="db-note">' + esc(i.note) + "</div>" : "")
    + "</li>";
}
/* under an "active of N" heading the chip on every row says nothing */
function dbActiveRow(i) {
  return dbRow(Object.assign({}, i,
    { flags: (i.flags || []).filter((f) => f !== "active") }));
}
function dbFullRow(i) { return dbRowHtml(i, false); }
function dbStatusRow(i) { return dbRowHtml(i, true); }
function dbQuiet(title, arr, fn) {
  return arr.length ? '<p class="db-subhead">' + esc(title) + "</p>"
    + dbList(arr, DB_FULL, fn, "db-quiet") : "";
}
/* A statement of use is not a prescription, a dispensing or an observed dose. */
function dbMedBasis(meds, said, nDoses) {
  if (said) return "";
  const n = {};
  meds.forEach((m) => { if (m.basis) n[m.basis] = (n[m.basis] || 0) + 1; });
  const kinds = Object.keys(n);
  if (!kinds.length) return "";
  let text = kinds.length === 1 && kinds[0] === "stated as taking"
    ? "This list is what is stated as taken - not reconciled against prescriptions,"
      + " dispensing or actual use."
    : "Basis: " + kinds.map((k) => n[k] + " " + k).join(", ") + "."
      + (n.prescribed || n.dispensed
          ? " Prescribed or dispensed does not show what was actually taken." : "");
  if (!n.given && !nDoses) text += " No last dose is recorded.";
  return '<p class="db-more">' + esc(text) + "</p>";
}
function dbPlanRank(i) {
  if (hasFlag(i, "cancelled") || i.status === "cancelled") return 0;
  if (hasFlag(i, "planned") || i.status === "scheduled") return 1;
  return 2;
}
/* Owner, time and status each get a line, so a missing one leaves a visible
   hole instead of a shorter row. */
function dbPlanRow(i) {
  const cancelled = dbPlanRank(i) === 0;
  const flagged = cancelled && !hasFlag(i, "cancelled")
    ? Object.assign({}, i, { flags: (i.flags || []).concat("cancelled") }) : i;
  // the detail repeats the dates as one string; keep only what "when" lacks
  const rest = (i.detail || "").split("; ").filter((part) => part
    && (!i.date || part.indexOf(shortDate(i.date)) === -1));
  const fact = (k, v) => '<div class="db-fact"><span class="db-k">' + k
    + "</span> " + v + "</div>";
  return "<li" + (cancelled ? ' class="db-cancelled"' : "") + ">"
    + '<div class="db-plan-label">' + esc(i.label || "Unnamed plan")
    + dbChips(flagged, ["active", "planned"], ["no named owner", "no date"]) + "</div>"
    + fact("Status", i.status ? '<span class="db-status">' + esc(statusWord(i))
        + "</span>" : dbGap("no status"))
    + fact("When", (i.date ? esc(datedText(i)) : (rest.length ? "" : dbGap("no date")))
        + (rest.length ? ' <span class="db-state">' + (i.date ? "&middot; " : "")
            + esc(rest.join("; ")) + "</span>" : ""))
    + fact("Who", i.owner ? esc(cvOwnerText(i)) : dbGap("no named owner"))
    + ((i.steps || []).length
        ? (isCritical(i) ? fact("Steps", esc(cvStepsLine(i).replace(/ steps?/, ""))
                                   + ", listed under Critical")
           : cvStepsHtml(i)) : "")
    + (i.note ? '<div class="db-note">' + esc(i.note) + "</div>" : "")
    + "</li>";
}
function dbSpan(days) {
  if (days < 31) return plural(days, "day");
  const months = Math.floor(days / 30.44);
  return months < 24 ? plural(months, "month") : plural(Math.floor(months / 12), "year");
}
/* How old the newest result was when the document was written; null when
   either date is missing, because then nothing can be said. */
function dbCurrency(results, asOf) {
  const newest = results.map((r) => shortDate(r.date))
    .filter((v) => v && !isNaN(Date.parse(v))).sort().pop();
  const ref = Date.parse(shortDate(asOf));
  if (!newest || isNaN(ref)) return null;
  const days = Math.round((ref - Date.parse(newest)) / 86400000);
  const stale = days > 180;
  let text = "Newest result " + newest;
  if (days < 0) text += " - dated after this document.";
  else if (days === 0) text += " - same day as this document.";
  else {
    text += " - " + dbSpan(days) + " before this document.";
    if (days > 180) text += " Out of date - not a current basis for decisions.";
    else if (days > 30) text += " Reference values, not a current basis.";
  }
  return { stale: stale, html: '<p class="db-currency'
    + (stale || days < 0 ? " stale" : "") + '">' + esc(text) + "</p>" };
}

function viewDashboard(d) {
  const s = d.summary || {};
  const q = s.quality || {};
  const p = s.patient;
  const sections = s.sections || [];
  const items = cvSectionItems(s).filter((i) => !i.assertion);
  const orphans = cvOrphans(s);
  const alerts = cvCat(items, "alert");
  const allergies = cvCat(items, "allergy");
  const problems = cvCat(items, "problem");
  const meds = cvCat(items, "medication");
  const results = cvCat(items, "result");
  const shots = cvCat(items, "immunization");
  const procedures = cvCat(items, "procedure");
  const devices = cvCat(items, "device");
  const plans = cvCat(items, "plan");
  const other = cvCat(items, "other");
  const docDate = (s.composition || {}).date;
  let h = '<div class="db-grid">';

  h += dbCard("Patient",
    '<div class="db-big">' + esc((p && p.name) || "Unnamed") + "</div>"
    + '<div class="db-sub">' + (p ? cvPatientMeta(p, docDate) : "") + "</div>"
    + (p && p.identifiers && p.identifiers.length
        ? '<div class="db-more">' + p.identifiers.map((i) => esc(i.value))
            .join(" &middot; ") + "</div>" : ""),
    p && p.name ? "" : "alert");

  /* The author's own "read this first": a difficult airway, an
     immunosuppressant. Straight after the patient, before the allergies the
     reader would otherwise start with, and its note shown in full - the note
     is where the author says what to do about it. */
  if (alerts.length) {
    const urgent = alerts.filter((a) => hasFlag(a, "high priority"));
    h += dbCard("Alerts",
      '<div class="db-big">' + alerts.length
      + (urgent.length ? ' <span class="chip cvc risk">' + urgent.length
          + " high priority</span>" : "") + "</div>"
      + dbList(urgent.concat(alerts.filter((a) => urgent.indexOf(a) === -1)), 5,
          (i) => dbRow(i) + (i.note
            ? '<li class="db-note">' + esc(i.note) + "</li>" : "")),
      urgent.length ? "alert" : "");
  }

  /* A narrative-only section (the patient story: call him Ville, mother
     knows the airway history) has no entries to count, so it is shown as
     the prose it is, right after the alerts. */
  sections.filter((x) => x.narrative).forEach((x) => {
    h += dbCard(x.title || "Patient story",
      '<div class="db-prose">' + x.narrative.split("\n")
        .map((line) => "<p>" + esc(line) + "</p>").join("") + "</div>");
  });

  const high = allergies.filter((a) => hasFlag(a, "high risk"));
  const orphanAllergies = cvCat(orphans, "allergy");
  const allergySec = sectionFor(sections, "allergy");
  let aBody;
  let aCls = "";
  if (allergies.length) {
    /* Truncating in source order can drop a high-risk allergy off a list that
       still shows five low-risk ones, so risk comes first. */
    aBody = '<div class="db-big">' + allergies.length
      + (high.length ? ' <span class="chip cvc risk">' + high.length
          + " high criticality</span>" : "") + "</div>"
      + dbList(high.concat(allergies.filter((a) => !hasFlag(a, "high risk"))),
               5, dbRow);
    aCls = high.length ? "alert" : "";
  } else if (allergySec && (allergySec.state === "stated-none"
                             || allergySec.state === "none-known")) {
    aBody = '<div class="db-big">'
      + (allergySec.state === "stated-none" ? "No known allergies" : "None known")
      + "</div>"
      + (orphanAllergies.length
          ? '<div class="db-sub">Contradicted: '
            + plural(orphanAllergies.length, "allergy resource",
                     "allergy resources")
            + " sits in the bundle unreferenced, so the statement and the data"
            + " disagree. Do not rely on either.</div>"
            + dbList(orphanAllergies, 5, dbRow)
          : '<div class="db-sub">' + esc(STATE_TEXT[allergySec.state])
            + " Confirm with the patient before giving a new drug.</div>");
    aCls = orphanAllergies.length ? "alert" : "";
  } else if (d.docType && d.docType !== "eps") {
    /* Only a patient summary has to say something about allergies; flagging a
       lab report or a prescription for its silence flags it for what it is. */
    aBody = null;
  } else {
    aBody = '<div class="db-big">Unknown</div><div class="db-sub">Information'
      + " missing: neither an allergy nor a statement that none is known"
      + (allergySec && allergySec.empty_reason
          ? " (" + esc(allergySec.empty_reason) + ")" : "") + ".</div>";
    aCls = "alert";
  }
  if (aBody) h += dbCard("Allergies and intolerances", aBody, aCls);

  /* What is wrong, what is taken for it and who is responsible are read
     against each other, so the three sit in one row of their own. */
  h += '</div><div class="db-grid db-trio">';

  /* Not active is not gone: a depression in remission or a resolved stroke
     still explains the medicine list and the care plan. */
  const active = problems.filter((x) => hasFlag(x, "active"));
  const notActive = problems.filter((x) => !hasFlag(x, "active"));
  h += dbCard("Problems",
    '<div class="db-big">' + (active.length || problems.length) + "</div>"
    + '<div class="db-sub">' + (active.length ? "active of " + problems.length
        + " recorded" : (problems.length ? "recorded, none marked active"
        : "nothing recorded")) + "</div>"
    + (active.length
        ? dbList(byRelevance(active), DB_FULL, dbActiveRow)
          + dbQuiet("Not marked active", notActive, dbStatusRow)
        : dbList(byRelevance(problems), DB_FULL, dbStatusRow)),
    problems.some(isCritical) ? "alert" : "");

  /* A recorded dose is a fact about a medicine, not one more medicine: it is
     shown on the row it belongs to and kept out of the counts. */
  const doses = meds.filter((x) => hasFlag(x, "last dose"))
    .sort((a, b) => (a.date || "") < (b.date || "") ? 1 : -1);
  const drugs = meds.filter((x) => !hasFlag(x, "last dose"));
  const sameDrug = (a, b) => (a.code && a.code === b.code) || (a.label && a.label === b.label);
  const strayDoses = doses.filter((x) => !drugs.some((m) => sameDrug(m, x)));
  const activeMeds = drugs.filter((x) => hasFlag(x, "active"));
  const medsShown = activeMeds.length ? activeMeds : drugs;
  const noDose = countGap(medsShown, "no dose");
  /* the basis is only worth a line per row when the rows differ in it */
  const mixedBasis = new Set(drugs.map((m) => m.basis).filter(Boolean)).size > 1;
  const medRow = (i) => {
    const last = doses.find((x) => sameDrug(i, x));
    return dbRowHtml(i, !hasFlag(i, "active"), [mixedBasis ? cvBasis(i) : "",
      last ? "last dose " + (last.date ? shortDate(last.date) : "recorded without a date")
           : ""]);
  };
  h += dbCard("Current medication",
    '<div class="db-big">' + (activeMeds.length || drugs.length) + "</div>"
    + '<div class="db-sub">' + (activeMeds.length
        ? "active of " + drugs.length + " recorded"
          + (noDose ? ", " + noDose + " without a usable dose" : "")
        : (drugs.length ? "recorded, none marked active" : "nothing recorded"))
    + "</div>" + dbMedBasis(drugs, (s.attention || []).some((a) => a.kind === "unreconciled"),
                            doses.length)
    + dbList(byRelevance(medsShown), DB_FULL, medRow)
    + (activeMeds.length
        ? dbQuiet("Not active", drugs.filter((x) => !hasFlag(x, "active")), medRow)
        : "")
    + dbQuiet("Doses given, with no matching medicine in the list", strayDoses, dbFullRow),
    noDose ? "alert" : "");

  if (plans.length) {
    const nCancelled = plans.filter((x) => dbPlanRank(x) === 0).length;
    const unowned = plans.filter((x) => !x.owner).length;
    h += dbCard("Care plan and responsibility",
      '<div class="db-big">' + plans.length
      + (nCancelled ? ' <span class="chip cvc risk">' + nCancelled
          + " cancelled</span>" : "") + "</div>"
      + '<div class="db-sub">' + (unowned ? unowned + " of " + plans.length
          + " without a named owner" : "each with a named owner") + "</div>"
      + dbList(plans.slice().sort((a, b) => dbPlanRank(a) - dbPlanRank(b)),
               DB_FULL, dbPlanRow)
      + '<p class="db-more">The document records what was planned - not that a'
      + " receiving provider or municipality has confirmed the handover.</p>",
      nCancelled ? "alert" : "");
  }
  h += "</div>";

  let rest = "";
  if (results.length) {
    const recent = results.slice()
      .sort((a, b) => (a.date || "") < (b.date || "") ? 1 : -1);
    const abn = results.filter((r) => hasFlag(r, "abnormal"));
    const currency = dbCurrency(results, s.as_of || docDate);
    const lab = cvSharedPerformer(results);
    const shown = abn.length ? abn.concat(recent.filter((r) => abn.indexOf(r) === -1))
      : recent;
    rest += dbCard("Results",
      '<div class="db-big">' + results.length
      + (abn.length ? ' <span class="chip cvc risk">' + abn.length
          + " abnormal</span>" : "") + "</div>"
      + (currency ? currency.html : "")
      + (lab ? '<p class="db-more">All from ' + esc(lab) + ".</p>" : "")
      + dbList(lab ? cvDropPerformer(shown) : shown, DB_FULL, dbFullRow),
      abn.length || (currency && currency.stale) ? "alert" : "");
  }
  if (devices.length) {
    rest += dbCard("Devices and implants",
      '<div class="db-big">' + devices.length + "</div>"
      + dbList(devices, DB_FULL, dbFullRow));
  }
  if (procedures.length) {
    rest += dbCard("Procedures", '<div class="db-big">' + procedures.length + "</div>"
      + dbList(procedures.slice()
          .sort((a, b) => (a.date || "") < (b.date || "") ? 1 : -1), 5, dbRow));
  }
  if (shots.length) {
    rest += dbCard("Vaccinations", '<div class="db-big">' + shots.length + "</div>"
      + dbList(shots.slice().sort((a, b) => (a.date || "") < (b.date || "") ? 1 : -1),
               4, dbRow));
  }
  if (other.length) {
    rest += dbCard("Other entries", '<div class="db-big">' + other.length + "</div>"
      + '<div class="db-sub">carried by the document but outside the standard'
      + " summary categories</div>" + dbList(other, 5, dbRow));
  }
  h += (rest ? '<div class="db-grid">' + rest + "</div>" : "") + '<div class="db-grid">';

  const cov = s.coverage;
  if (cov) {
    const withData = cov.filter((c) => c.state === "data");
    const notApplicable = cov.filter((c) => c.applicable === false);
    const req = cov.filter((c) => c.required);
    const reqMissing = req.filter((c) => c.state === "missing" || c.state === "absent");
    const nilKnown = cov.filter((c) => c.state === "stated-none" || c.state === "none-known");
    const missing = cov.filter((c) => c.state === "missing");
    const absent = cvAbsentRest(s);
    const names = (arr) => arr.map((c) => esc(c.name)
      + (c.required ? " (required)" : "")).join(", ");
    h += dbCard("EPS section coverage",
      '<div class="db-big">' + withData.length + " / "
      + (cov.length - notApplicable.length) + "</div>"
      + '<div class="db-sub">sections of the EPS guide with data, '
      + req.filter((c) => c.state === "data").length + " of the " + req.length
      + " required ones</div>"
      + (notApplicable.length ? '<p class="db-more"><strong>Not counted:</strong> '
          + names(notApplicable) + " - does not apply to this patient.</p>" : "")
      + (nilKnown.length ? '<p class="db-more"><strong>None known:</strong> '
          + names(nilKnown) + " - not proof of absence.</p>" : "")
      + (missing.length ? '<p class="db-more"><strong>Present but empty:</strong> '
          + names(missing) + "</p>" : "")
      + (absent.rest.length ? '<p class="db-more"><strong>'
          + (absent.also ? "Also not sent:" : "Not in the document:") + "</strong> "
          + names(absent.rest) + (absent.also ? "." : " - not sent, which is not"
          + " the same as nothing to report.") + "</p>"
          : ""),
      reqMissing.length ? "alert" : "");
  } else {
    const empty = sections.filter((x) => !(x.items || []).length && !x.narrative);
    h += dbCard("Document coverage",
      '<div class="db-big">' + (sections.length - empty.length) + " / "
      + sections.length + "</div>"
      + '<div class="db-sub">sections carrying data</div>'
      + (empty.length ? dbList(empty, 6, (x) => "<li>" + esc(x.title || "Untitled")
          + (x.empty_reason ? '<span class="chip cvc warn">' + esc(x.empty_reason)
              + "</span>" : '<span class="chip cvc gap">no reason given</span>')
          + "</li>") : ""),
      empty.some((x) => !x.empty_reason) ? "alert" : "");
  }

  const total = q.items || 0;
  let dq = dbMeter("Has a code", q.coded || 0, total)
    + dbMeter("Has a date", q.dated || 0, total);
  const gaps = q.gaps || {};
  const gapKeys = Object.keys(gaps);
  if (gapKeys.length) {
    dq += dbList(gapKeys, 5, (g) => "<li>" + esc(g)
      + '<span class="chip cvc gap">' + gaps[g] + "</span></li>");
    dq += '<p class="db-more">These check only that fields are filled in - not'
      + " whether a code or binding is valid, nor how current an entry is.</p>";
  }
  h += dbCard("Technical checks (" + total + " entries)", dq,
    total && pctOf((q.items || 0) - (q.with_gaps || 0), total) < 60 ? "alert" : "");

  if ((s.unreferenced || []).length) {
    h += dbCard("Unreachable resources",
      '<div class="db-big">' + s.unreferenced.length + "</div>"
      + '<div class="db-sub">in the bundle but not referenced by any section, so a'
      + " conforming viewer may never show them</div>"
      + dbList(s.unreferenced, 5, dbRow), "alert");
  }
  return h + "</div>";
}

/* ---- baseline: plain document rendering ---- */
function viewDocument(d) {
  const s = d.summary || {};
  let html = "";
  const p = s.patient;
  if (p) {
    const meta = [p.birth_date ? "Born " + esc(p.birth_date) : null,
                  p.gender ? esc(p.gender) : null].filter(Boolean).join(" &middot; ");
    html += '<div class="patient-card">'
      + '<div class="patient-name">' + esc(p.name || "Unnamed patient") + "</div>"
      + (meta ? "<div>" + meta + "</div>" : "")
      + (p.identifiers && p.identifiers.length
        ? '<div class="muted" style="font-size:calc(0.8 * var(--rem))">'
          // the assigning authority's OID is plumbing; the number on the card
          // is what identifies the patient to anyone reading this
          + p.identifiers.map((i) => esc(i.value)).join(" &middot; ") + "</div>"
        : "")
      + "</div>";
  } else {
    html += '<p class="muted">No patient details found in this document.</p>';
  }
  for (const sec of s.sections || []) {
    html += '<h3 class="cv-sec">' + esc(sec.title || "Untitled section") + "</h3>";
    if (sec.state === "stated-none" || sec.state === "none-known") {
      html += '<p class="muted" style="margin:2px 0 8px">'
        + (sec.items && sec.items.length
            ? esc(sec.items.map((i) => i.label).join(", ")) + " - " : "")
        + esc(STATE_TEXT[sec.state]) + "</p>";
    } else if (sec.items && sec.items.length) {
      const lab = cvSharedPerformer(sec.items);
      html += lab ? '<p class="muted cv-performer">All from ' + esc(lab) + ".</p>" : "";
      // a section's own entries come first, then each sub-section's (a lab
      // report's "Blood examinations") under its own sub-heading
      const runs = [];
      sec.items.forEach((it) => {
        const sub = it.subsection || null;
        if (!runs.length || runs[runs.length - 1].sub !== sub) runs.push({ sub, items: [] });
        runs[runs.length - 1].items.push(it);
      });
      runs.forEach((r) => {
        html += (r.sub ? '<h4 class="cv-subsec">' + esc(r.sub) + "</h4>" : "")
          + '<ul class="cv-items">'
          + byRelevance(lab ? cvDropPerformer(r.items) : r.items).map(cvItemHtml).join("")
          + "</ul>";
      });
    } else if (sec.narrative) {
      // a section that is its narrative (a patient story): the prose is the
      // content, shown as written
      html += '<div class="cv-narrative">' + sec.narrative.split("\n")
        .map((line) => "<p>" + esc(line) + "</p>").join("") + "</div>";
    } else if (sec.empty_reason) {
      html += '<p class="muted" style="margin:2px 0 8px">No entries - '
        + esc(sec.empty_reason) + ". " + esc(STATE_TEXT.missing) + "</p>";
    } else {
      html += '<p class="muted" style="margin:2px 0 8px">No entries. '
        + esc(STATE_TEXT.missing) + "</p>";
    }
  }
  const notSent = cvAbsentRest(s);
  const absent = notSent.rest;
  if (absent.length) {
    html += '<h3 class="cv-sec muted">Not in this document</h3>'
      + '<p class="muted" style="margin:0;font-size:calc(0.85 * var(--rem))">'
      + (notSent.also ? "Also not sent: "
          : plural(absent.length, "EPS section") + " not sent: ")
      + absent.map((c) => esc(c.name) + (c.required ? " (required)" : "")).join(", ")
      + ". Absent means the information did not come across - not that there"
      + " is nothing to report.</p>";
  }
  if (s.unreferenced && s.unreferenced.length) {
    html += '<h3 class="cv-sec muted">Not referenced by any section</h3>'
      + '<p class="muted" style="margin:0;font-size:calc(0.8 * var(--rem))">These items are in the'
      + " document but no section points at them (data-quality hint).</p>"
      + '<ul class="cv-items">' + s.unreferenced.map(cvItemHtml).join("") + "</ul>";
  }
  return html;
}

/* Insertion order is the order of the buttons, and the first one is what a
   document opens in: the plain rendering is the thing being judged, so it comes
   before the two interpretations of it. */
export const VIEWS = {
  document: { fn: viewDocument, name: "Document view",
    why: "The plain section-by-section rendering." },
  dashboard: { fn: viewDashboard, name: "Dashboard view",
    why: "Risk and completeness first - what would stop you prescribing, before"
       + " you read anything else." },
  timeline: { fn: viewTimeline, name: "Timeline view",
    why: "Chronology across every section - shows recency, and whether the"
       + " record is current enough to act on." },
};

export const DEFAULT_VIEW = "document";

function modesHtml(mode) {
  return '<div class="cv-modes" role="group" aria-label="View">' + Object.keys(VIEWS).map((k) =>
    '<button type="button" class="cv-mode' + (k === mode ? " active" : "")
    + '" data-mode="' + k + '" title="' + esc(VIEWS[k].why) + '"'
    + ' aria-pressed="' + (k === mode) + '">'
    + esc(VIEWS[k].name) + "</button>").join("") + "</div>";
}

/* d is { summary, doc_type } as read() returns it. Options: view ("document",
   "dashboard" or "timeline"), switcher (false leaves the view buttons out),
   caption (a line of your own for under the title, such as a file name) and
   today (YYYY-MM-DD, for documents that carry no date). */
export function renderDocument(d, options = {}) {
  const s = d.summary || {};
  const comp = s.composition || {};
  const mode = Object.hasOwn(VIEWS, options.view) ? options.view : DEFAULT_VIEW;
  today = options.today || new Date().toISOString().slice(0, 10);
  let html = options.switcher === false ? "" : modesHtml(mode);
  // what kind of document this is, in the title when it has none of its own
  html += "<h2>" + esc(comp.title || docLabel(d.docType || "eps")) + "</h2>";
  const meta = [comp.title && d.docType ? esc(docLabel(d.docType)) : "",
    options.caption ? esc(options.caption) : "",
    comp.date ? "document date " + esc(comp.date.split("T")[0])
      + ' <span class="cv-sub">(when it was assembled - not how current'
      + " each entry is)</span>" : ""].filter(Boolean);
  if (meta.length) {
    html += '<p class="muted co-name" style="margin:2px 0 0">' + meta.join(" &middot; ") + "</p>";
  }
  html += cvContextHtml(s) + cvCriticalHtml(s);
  html += VIEWS[mode].fn(d) + cvQualityHtml(s, mode);
  return html;
}
