// What a reader has to see, checked on the three example documents: the
// critical box first, then what is missing or possibly outdated, then the
// view; and a timeline that runs the right way.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { read, renderHtml, renderStatic, parseJson, VIEWS, NOT_A_BUNDLE }
  from "../fhir-document-viewer.js";

const sample = (id) => readFileSync(new URL(`../samples/${id}.json`, import.meta.url), "utf8");
const SAMPLES = ["andrea-cross-border", "arne-complex-care", "ville-difficult-airway"];
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const between = (html, from, to) => {
  const a = html.indexOf(from);
  assert.notEqual(a, -1, `${from} not found`);
  const b = to ? html.indexOf(to, a) : -1;
  return html.slice(a, b === -1 ? undefined : b);
};
/* The pinned boxes: each line's category, name and chips, in order. */
const critical = (html) => [...between(html, 'class="cv-critical"', 'class="cv-attention"')
  .matchAll(/<li><span class="cv-crit-cat">(.*?)<\/span> <strong>(.*?)<\/strong>((?:<span class="chip[^>]*>[^<]*<\/span>)*)/g)]
  .map((m) => ({ category: m[1], name: text(m[2]), chips: text(m[3]) }));
const attention = (html) => [...between(html, 'class="cv-attention"', "</ul></div></div>")
  .matchAll(/<li><strong>(.*?)<\/strong>/g)].map((m) => text(m[1]));
const BODY = { document: 'class="patient-card"', dashboard: 'class="db-grid"',
  timeline: 'class="tl-legend"' };

for (const id of SAMPLES) {
  for (const view of Object.keys(VIEWS)) {
    test(`${id}, ${view}: critical, then missing and outdated, then the view`, () => {
      const html = renderHtml(sample(id), { view });
      const at = ['class="cv-critical"', 'class="cv-attention"', BODY[view], 'class="cv-quality"']
        .map((mark) => html.indexOf(mark));
      assert.ok(at.every((n) => n !== -1), `all four parts present: ${at}`);
      assert.deepStrictEqual(at, at.slice().sort((a, b) => a - b));
      assert.ok(!/undefined|NaN|\[object /.test(html));
      // the same pinned boxes whatever the view
      assert.deepStrictEqual(critical(html), critical(renderHtml(sample(id))));
      assert.deepStrictEqual(attention(html), attention(renderHtml(sample(id))));
    });
  }
}

test("Ville: the alerts lead, each followed by its care plan in full", () => {
  const html = renderHtml(sample("ville-difficult-airway"), { view: "dashboard" });
  assert.deepStrictEqual(critical(html), [
    { category: "Alert", chips: "high priority",
      name: "SVÅR LUFTVÄG - förväntat svår intubation och svår maskventilation" },
    { category: "Alert", chips: "high priority",
      name: "IMMUNSUPPRIMERAD - adalimumab och metotrexat" },
    { category: "Care plan", chips: "plan for a high-priority alert",
      name: "Luftvägsplan inför sedering, narkos och intubation" },
    { category: "Care plan", chips: "plan for a high-priority alert",
      name: "Infektionsplan under immunsuppression" },
  ]);
  const box = text(between(html, 'class="cv-critical"', 'class="cv-attention"'));
  assert.match(box, /responsible: Dr Johan Lindberg · \+46 8 000 00 11/);
  assert.match(box, /5 steps - all not started/);
  assert.match(box, /Kontakta barnanestesiolog och ÖNH-läkare innan all sedering/);
  assert.deepStrictEqual(attention(html),
    ["Not in this document: Functional status, Vital signs, Social history"]);
});

test("Arne: allergy, heart failure, anticoagulant and insulin, and what cannot be checked", () => {
  const html = renderHtml(sample("arne-complex-care"));
  assert.deepStrictEqual(critical(html), [
    { category: "Allergy", name: "Penicillin", chips: "high criticality" },
    { category: "Problem", name: "Kronisk hjärtsvikt", chips: "active high risk" },
    { category: "Medicine", name: "Apixaban 5 mg tablett", chips: "active anticoagulant" },
    { category: "Medicine", name: "Insulin glargin 100 E/ml injektionsvätska",
      chips: "active insulin" },
  ]);
  const box = text(between(html, 'class="cv-critical"', 'class="cv-attention"'));
  assert.match(box, /Last dose: not recorded/);
  assert.match(box, /Renal function: eGFR 46 mL\/min\/1\.73 m2 \(low\) · 2026-06-12/);
  assert.match(box, /Weight: not in this document/);
  assert.match(box, /Marked high risk by this view from the diagnosis, not by the author\./);
  assert.deepStrictEqual(attention(html), [
    "Newest results are from 2026-06-12",
    "Medication list not reconciled",
    "Not in this document: Functional status, Advance directives, Vital signs, Social history",
  ]);
});

test("Andrea: the cancelled follow-up and the stale results are said", () => {
  const html = renderHtml(sample("andrea-cross-border"));
  assert.deepStrictEqual(critical(html).map((x) => x.category + ": " + x.chips), [
    "Problem: active high risk", "Medicine: active insulin", "Medicine: active insulin",
    "Care plan: no named owner"]);
  assert.deepStrictEqual(attention(html), [
    "Cancelled: Digital follow-up with diabetes specialist nurse, Uppsala - every 3 months",
    "Data shared with the diabetes clinic in Uppsala; no readings uploaded since 2026-06-02.",
    "Newest results are from 2025-12-09",
    "Medication list not reconciled",
    "Not in this document: Functional status, Advance directives, Vital signs, Social history,"
      + " History of pregnancy",
  ]);
  const dash = text(renderHtml(sample("andrea-cross-border"), { view: "dashboard" }));
  assert.match(dash, /Newest result 2025-12-09 - 8 months before this document\. Out of date/);
});

/* The timeline's rows in page order: its year headings and each row's date. */
function timeline(html) {
  const tl = between(html, '<div class="tl">', '<p class="cv-quality">');
  const out = [];
  for (const m of tl.matchAll(/<div class="tl-year([^"]*)">(.*?)<\/div>|<div class="tl-row[^"]*"><div class="tl-date">(.*?)<\/div>/g)) {
    if (m[2] !== undefined) out.push({ heading: m[2], upcoming: m[1].includes("tl-upcoming") });
    else out.push({ date: /\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{4}/.exec(text(m[3]))[0] });
  }
  return out;
}

for (const id of SAMPLES) {
  test(`${id}: timeline runs upcoming first, then newest to oldest`, () => {
    const doc = read(sample(id));
    const asOf = (doc.summary.as_of || doc.summary.composition.date).slice(0, 10);
    const rows = timeline(renderHtml(doc, { view: "timeline" }));
    assert.ok(rows.filter((r) => r.date).length >= 20);
    const headings = rows.filter((r) => r.heading);
    const years = headings.filter((h) => !h.upcoming).map((h) => h.heading);
    assert.deepStrictEqual(years, years.slice().sort().reverse());
    assert.equal(new Set(years).size, years.length);
    // "Upcoming" only ever leads
    assert.ok(headings.every((h, n) => !h.upcoming || n === 0));
    let section = null;
    let last = null;
    for (const row of rows) {
      if (row.heading) { section = row; last = null; continue; }
      const day = Date.parse(row.date);
      if (section.upcoming) {
        assert.ok(day > Date.parse(asOf), `${row.date} is after the document date`);
        if (last !== null) assert.ok(day >= last, `${row.date} soonest first`);
      } else {
        assert.equal(row.date.slice(0, 4), section.heading);
        assert.ok(day <= Date.parse(asOf));
        if (last !== null) assert.ok(day <= last, `${row.date} newest first`);
      }
      last = day;
    }
  });
}

test("Arne: the booked follow-up is upcoming, the allergy from 1972 comes last", () => {
  const rows = timeline(renderHtml(sample("arne-complex-care"), { view: "timeline" }));
  assert.deepStrictEqual(rows[0], { heading: "Upcoming", upcoming: true });
  assert.equal(rows.at(-1).date, "1972-06-18");
  assert.equal(rows.filter((r) => r.heading).at(-1).heading, "1972");
});

test("what is not a Bundle is refused, as Provbana's preview refuses it", () => {
  for (const bad of ["", "not json", "[]", "null", '{"resourceType":"Patient"}', {}, null, 7]) {
    assert.throws(() => read(bad), { name: "TypeError", message: NOT_A_BUNDLE });
  }
  // an empty Bundle is a Bundle: it renders, and says what is missing
  const html = renderHtml('{"resourceType":"Bundle"}');
  assert.match(html, /No patient details found in this document\./);
});

test("options: view, switcher, caption", () => {
  const doc = read(sample("andrea-cross-border"));
  assert.equal(renderHtml(doc, { view: "nonsense" }), renderHtml(doc, { view: "document" }));
  assert.match(renderHtml(doc), /class="cv-mode active" data-mode="document"/);
  assert.match(renderHtml(doc, { view: "timeline" }), /class="cv-mode active" data-mode="timeline"/);
  assert.ok(!renderHtml(doc, { switcher: false }).includes("cv-mode"));
  assert.match(renderHtml(doc, { caption: "<b>a & b</b>" }), /&lt;b&gt;a &amp; b&lt;\/b&gt;/);
  const page = renderStatic(doc, { theme: "dark" });
  assert.match(page, /^<fhir-document-viewer theme="dark" static><template shadowrootmode="open"><style>/);
  assert.ok(!page.includes("cv-mode\""));
});

test("markup in the document is shown, never run", () => {
  const bundle = JSON.parse(sample("andrea-cross-border"));
  const patient = bundle.entry.find((e) => e.resource.resourceType === "Patient").resource;
  patient.name = [{ text: '<img src=x onerror="alert(1)">' }];
  for (const view of Object.keys(VIEWS)) {
    const html = renderHtml(bundle, { view });
    assert.ok(!html.includes("<img"), view);
    assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), view);
  }
});

test("a decimal keeps the precision it was written with, given the text", () => {
  const bundle = (value) => `{"resourceType":"Bundle","type":"collection","entry":[{"resource":
    {"resourceType":"Observation","status":"final","code":{"text":"Potassium"},
     "valueQuantity":{"value":${value},"unit":"mmol/L"}}}]}`;
  const shown = (input) => read(input).summary.sections[0].items[0].detail;
  assert.match(shown(bundle("5.0")), /^5\.0 mmol\/L/);
  assert.match(shown(bundle("5")), /^5 mmol\/L/);
  assert.match(shown(bundle("5.10")), /^5\.1 mmol\/L/);
  // parsed elsewhere, the ".0" is already gone
  assert.match(shown(JSON.parse(bundle("5.0"))), /^5 mmol\/L/);
  assert.match(shown(parseJson(bundle("5.0"))), /^5\.0 mmol\/L/);
});
