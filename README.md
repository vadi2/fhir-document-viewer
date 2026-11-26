# fhir-document-viewer

A dependency-free web component that renders a FHIR document Bundle - an International
Patient Summary (IPS), a European Patient Summary (EPS) or another EHDS document - the
way a clinician would read it: critical alerts first, then what is missing or possibly
outdated, then a dashboard, a timeline or the document section by section.

**[Live demo](https://vadimperetok.in/fhir-document-viewer/)** - three synthetic
patients, or paste your own Bundle (it stays in your browser).

![The dashboard view of a synthetic patient summary](docs/dashboard.png)

## Use it

One script tag, no build step, no dependencies:

```html
<script type="module"
  src="https://cdn.jsdelivr.net/gh/vadi2/fhir-document-viewer@0.1.2/fhir-document-viewer.js"></script>

<fhir-document-viewer src="patient-summary.json" view="dashboard"></fhir-document-viewer>
```

Or hand it a Bundle you already have, as JSON text or a parsed object:

```js
document.querySelector("fhir-document-viewer").bundle = jsonText;
```

A Bundle can also sit in the page, in a `<script type="application/fhir+json">` inside
the element. Everything happens in the browser: the only network request is the `src`
you give it. [examples/minimal.html](examples/minimal.html) is a complete page.

Without a CDN, copy `fhir-document-viewer.js` and `src/` next to your page, or install
it from npm:

```bash
npm install fhir-document-viewer
```

## What it shows

| `view` | |
|---|---|
| `document` (default) | The patient, then every section in the document's own order. |
| `dashboard` | One card per clinical question: alerts, allergies, problems, medication, care plans, results and their age, devices, procedures, vaccinations. |
| `timeline` | Every dated entry in one column: upcoming first, then newest to oldest. |

Two boxes are pinned above every view:

- **Critical** - high-priority alerts (`Flag`) with the care plan that answers them,
  high-criticality allergies, high-risk problems, anticoagulants and insulin.
- **Missing and possibly outdated** - expected sections that are absent, results too old
  to act on, an unreconciled medication list, cancelled follow-ups.

![The timeline view](docs/timeline.png)

## Document types

The type is read off the Bundle, never asked for.

| Document | Recognised by |
|---|---|
| **Patient summary** - IPS, HL7 Europe EPS, national IPS profiles | Composition type LOINC `60591-5`, or the EPS Bundle profile |
| **Laboratory report** - HL7 Europe Laboratory | LOINC `11502-2`, or the EU laboratory Bundle profile |
| **Prescription and dispense** - HL7 Europe MPD | An MPD entry profile, or a `MedicationRequest` / `MedicationDispense` with no Composition |
| **Imaging report** - HL7 Europe Imaging | The EU imaging Bundle profiles, or an `ImagingStudy` entry (listed, no images shown) |
| **Hospital discharge report** - HL7 Europe HDR | LOINC `34105-7`, or the EU discharge report Bundle profiles |

Any other FHIR Bundle is shown as a patient summary would be. Sections are matched by
LOINC code first and title second, so documents in any language work.

## Reference

| Attribute | Values | |
|---|---|---|
| `src` | URL | A Bundle to fetch and show. |
| `view` | `document`, `dashboard`, `timeline` | The view to open on. |
| `switcher` | `off` | Hide the view buttons. |
| `caption` | text | A note shown with the document type and date. |
| `theme` | `light`, `dark` | Pin the colour scheme; default follows the page. |
| `today` | `YYYY-MM-DD` | The day ages are counted from when the document has no date. |

- **Properties:** `bundle`, `view`, `caption`, read-only `summary` and `docType`
  (`eps`, `laboratory`, `mpd`, `imaging`, `hdr`).
- **Events:** `render`, `error` (`detail.message`), `viewchange` (bubbles).
- **Styling:** the viewer lives in a shadow root. Override `--fdv-font`,
  `--fdv-font-size`, `--fdv-font-weight`, `--fdv-radius`, `--fdv-accent`, `--fdv-bg`,
  `--fdv-text` and the other `--fdv-*` colours, or style `::part(frame)`.

The functions behind the element have no DOM dependency and run in Node 20+, Deno, Bun
and workers:

```js
import { read, renderHtml, renderStatic } from "fhir-document-viewer";

read(jsonText);                                // { docType, summary }, throws if not a Bundle
renderHtml(jsonText, { view: "timeline" });    // an HTML string, without the stylesheet
renderStatic(jsonText, { view: "dashboard" }); // a whole element that displays without script
```

Prefer JSON text over a parsed object: only the text still says whether a decimal was
written "5.0" or "5". Everything from the document is HTML-escaped.

## Limits

- **A reading aid, not a medical device.** What it marks critical or missing is a
  heuristic and must not be the basis for a clinical decision.
- **Not a validator.** It tolerates malformed input and says nothing about conformance.
- **No terminology server.** Anticoagulants and insulin are recognised by ATC code only,
  high-risk problems by diagnosis names in English, Swedish, Danish, Norwegian and German.
- **English interface.** Document content is shown in its own language.
- **JSON and FHIR R4 only**, one document at a time. No XML, no signature checking, and
  attachments are listed, not shown.

## Development

```bash
node --test
```

No install step. The tests render the three example documents, compare the view model
with Provbana's own output and replay 320 cases from Provbana's test suite. Every patient
in `samples/` and `test/` is synthetic, see
[test/fixtures/README.md](test/fixtures/README.md).

## Credit

This is the clinical view of [Provbana](https://github.com/vadi2/Provbana), an open
source platform for FHIR document tracks at hackathons, first used at the European
Patient Summary track of the Nordic Hackathon 2026.

[MIT](LICENSE)
