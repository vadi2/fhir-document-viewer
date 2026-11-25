// fhir-document-viewer: a FHIR document Bundle, rendered the way a clinician
// reads it. Loading this module defines <fhir-document-viewer>.
// https://github.com/vadi2/fhir-document-viewer - MIT
export { FhirDocumentViewer, read, renderHtml, renderStatic, TAG, NOT_A_BUNDLE } from "./src/element.js";
export { summarize, detectDocumentType, DOCUMENT_TYPES } from "./src/summarize.js";
export { parseJson } from "./src/datatypes.js";
export { VIEWS, DEFAULT_VIEW } from "./src/render.js";
export { css } from "./src/styles.js";
