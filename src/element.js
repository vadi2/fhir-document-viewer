// <fhir-document-viewer>: the readable view of one FHIR document Bundle.
import { parseJson, isObj } from "./datatypes.js";
import { detectDocumentType, summarize } from "./summarize.js";
import { renderDocument, DEFAULT_VIEW, VIEWS, esc } from "./render.js";
import { css } from "./styles.js";

export const TAG = "fhir-document-viewer";
export const NOT_A_BUNDLE = "Not a FHIR Bundle in JSON";

/* A Bundle, as JSON text or already parsed, read into what the views draw.
   Text is the better input: only the text still says whether a number was
   written "5" or "5.0". Throws a TypeError for anything that is not a Bundle. */
export function read(input, options = {}) {
  let bundle = input;
  if (typeof input === "string") {
    try { bundle = parseJson(input); } catch { bundle = null; }
  }
  if (!isObj(bundle) || bundle.resourceType !== "Bundle") throw new TypeError(NOT_A_BUNDLE);
  return { docType: detectDocumentType(bundle).id, summary: summarize(bundle, options) };
}

const isRead = (v) => isObj(v) && isObj(v.summary) && v.resourceType === undefined;

/* The view as an HTML string, without the stylesheet: for a shadow root of
   your own, or a server. Takes a Bundle (text or parsed) or what read() gave. */
export function renderHtml(input, options = {}) {
  return renderDocument(isRead(input) ? input : read(input, options), options);
}

/* A whole element as static HTML, stylesheet included, in a declarative shadow
   root: it shows without any script. The view buttons need the script, so they
   are left out unless asked for. */
export function renderStatic(input, options = {}) {
  const opts = Object.assign({ switcher: false }, options);
  return "<" + TAG + (opts.theme ? ' theme="' + esc(opts.theme) + '"' : "") + ' static>'
    + '<template shadowrootmode="open"><style>' + css + "</style>"
    + '<section class="fdv" part="frame">' + renderHtml(input, opts) + "</section>"
    + "</template></" + TAG + ">";
}

const Base = globalThis.HTMLElement || class {};

export class FhirDocumentViewer extends Base {
  static get observedAttributes() { return ["src", "view", "caption", "switcher", "today"]; }

  #box;
  #input = null;
  #doc = null;
  #message = null;
  #loading = 0;

  constructor() {
    super();
    // a declarative shadow root (renderStatic) is kept as it came
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    if (!root.querySelector(".fdv")) {
      root.innerHTML = "<style>" + css + '</style><section class="fdv" part="frame" hidden></section>';
    }
    this.#box = root.querySelector(".fdv");
    // delegated: the buttons are rebuilt with every render
    this.#box.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".cv-mode");
      if (!btn || btn.dataset.mode === this.view) return;
      this.view = btn.dataset.mode;
      this.dispatchEvent(new CustomEvent("viewchange",
        { detail: { view: this.view }, bubbles: true, composed: true }));
    });
  }

  connectedCallback() {
    // properties set before the element was defined
    for (const name of ["bundle", "view", "caption"]) {
      if (Object.hasOwn(this, name)) {
        const value = this[name];
        delete this[name];
        this[name] = value;
      }
    }
    if (this.#input === null && !this.hasAttribute("src")) this.#readInline();
  }

  attributeChangedCallback(name, before, value) {
    if (before === value) return;
    if (name === "src") { this.#fetch(value); return; }
    if (name === "today" && this.#input !== null) { this.#read(); return; }
    this.#render();
  }

  /* The Bundle to show: JSON text, a parsed Bundle, or null for nothing. */
  get bundle() { return this.#input; }
  set bundle(value) {
    this.#loading++;  // a fetch still on its way must not overwrite this
    this.#input = value === undefined ? null : value;
    this.#read();
  }

  /* What was read from the Bundle: null until one is shown. */
  get summary() { return this.#doc ? this.#doc.summary : null; }
  get docType() { return this.#doc ? this.#doc.docType : null; }

  get view() {
    const v = this.getAttribute("view");
    return Object.hasOwn(VIEWS, v) ? v : DEFAULT_VIEW;
  }
  set view(value) { this.setAttribute("view", value); }

  get caption() { return this.getAttribute("caption") || ""; }
  set caption(value) {
    if (value) this.setAttribute("caption", value); else this.removeAttribute("caption");
  }

  /* <script type="application/fhir+json"> inside the element, for a Bundle
     that travels in the page itself. */
  #readInline() {
    const pick = () => this.querySelector(
      'script[type="application/fhir+json"], script[type="application/json"]');
    const use = (el) => { if (el && this.#input === null) this.bundle = el.textContent; };
    if (pick()) use(pick());
    else if (this.ownerDocument.readyState === "loading") {
      // defined before the parser reached the children
      this.ownerDocument.addEventListener("DOMContentLoaded", () => use(pick()), { once: true });
    }
  }

  async #fetch(url) {
    const turn = ++this.#loading;
    if (!url) { this.#input = null; this.#read(); return; }
    let text = null, problem = null;
    try {
      const res = await fetch(url);
      if (res.ok) text = await res.text();
      else problem = "Could not load the document (HTTP " + res.status + ").";
    } catch (e) {
      problem = "Could not load the document: " + e.message;
    }
    if (turn !== this.#loading) return;
    if (problem) { this.#input = null; this.#fail(problem); return; }
    this.#input = text;
    this.#read();
  }

  #read() {
    this.#doc = null;
    this.#message = null;
    if (this.#input === null) { this.#render(); return; }
    try {
      this.#doc = read(this.#input, { today: this.getAttribute("today") || undefined });
    } catch (e) {
      this.#fail(e.message);
      return;
    }
    this.#render();
    this.dispatchEvent(new CustomEvent("render", { detail:
      { docType: this.#doc.docType, summary: this.#doc.summary, view: this.view } }));
  }

  #fail(message) {
    this.#doc = null;
    this.#message = message;
    this.#render();
    this.dispatchEvent(new CustomEvent("error", { detail: { message } }));
  }

  #render() {
    if (!this.#box) return;
    if (this.#doc) {
      this.#box.innerHTML = renderDocument(this.#doc, {
        view: this.view,
        caption: this.caption,
        switcher: this.getAttribute("switcher") !== "off",
        today: this.getAttribute("today") || undefined,
      });
    } else if (this.#message) {
      this.#box.innerHTML = '<p class="muted fdv-message error" role="alert">'
        + esc(this.#message) + "</p>";
    } else if (this.hasAttribute("static")) {
      return;  // server-rendered and nothing new to show
    } else {
      this.#box.innerHTML = "";
    }
    this.#box.hidden = !this.#doc && !this.#message;
  }
}

if (globalThis.customElements && !customElements.get(TAG)) {
  customElements.define(TAG, FhirDocumentViewer);
}
