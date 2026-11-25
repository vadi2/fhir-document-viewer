// The viewer's stylesheet, as a string so the component is one import with
// no separate file to serve. Lifted from Provbana's page.
export const css = `/* Provbana's palette and type scale. Every colour is a light/dark pair, so
   the viewer follows the page's color-scheme; theme="light" or theme="dark" on
   the element pins it. Any token can be overridden from outside as --fdv-<name>. */
:host { display: block; }
:host([hidden]) { display: none; }
:host([theme="light"]) { color-scheme: light; }
:host([theme="dark"]) { color-scheme: dark; }
:host {
  --rem: var(--fdv-font-size, 1rem);
  --font-sans: var(--fdv-font, "Manrope", system-ui, -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif);
  --fs-large: clamp(calc(1.125 * var(--rem)), calc(1.125 * var(--rem)) + ((1vw - calc(0.2 * var(--rem))) * 0.392), calc(1.375 * var(--rem)));
  --fs-x-large: clamp(calc(1.75 * var(--rem)), calc(1.75 * var(--rem)) + ((1vw - calc(0.2 * var(--rem))) * 0.392), calc(2 * var(--rem)));
  --r-card: var(--fdv-radius, 0px); --r-ctl: var(--fdv-radius, 0px);
  --bg: var(--fdv-bg, light-dark(#fbfaf3, #15141a));
  --card: var(--fdv-card, light-dark(#ffffff, #1e1c26));
  --text: var(--fdv-text, light-dark(#111111, #f3f1e7));
  --muted: var(--fdv-muted, light-dark(#5f5f5f, #a7a2b3));
  --border: var(--fdv-border, light-dark(#d8d5c7, #322e3d));
  --field-border: var(--fdv-field-border, light-dark(#8d8878, #6e6880));
  --accent: var(--fdv-accent, light-dark(#503aa8, #b9a8f7));
  --accent-soft: var(--fdv-accent-soft, light-dark(#efebfa, #292340));
  --btn: var(--fdv-btn, light-dark(#111111, #f3f1e7));
  --btn-on: var(--fdv-btn-on, light-dark(#ffffff, #15141a));
  --pass: var(--fdv-pass, light-dark(#16704a, #58cf94));
  --pass-bg: var(--fdv-pass-bg, light-dark(#e2f1e8, #123522));
  --fail: var(--fdv-fail, light-dark(#b3261e, #ff8a80));
  --fail-bg: var(--fdv-fail-bg, light-dark(#fbe7e4, #401d1a));
  --warn: var(--fdv-warn, light-dark(#7d5300, #f0cb4e));
  --warn-bg: var(--fdv-warn-bg, light-dark(#fbf0cf, #3a3110));
  --code-bg: var(--fdv-code-bg, light-dark(#f3f1e6, #131119));
  color: var(--text);
  font: var(--fdv-font-weight, 400) var(--rem)/1.5 var(--font-sans);
  letter-spacing: -0.1px; text-align: left;
}
/* Browsers without light-dark() (pre-2024) get the light palette rather than
   unparsed declarations and a viewer with no colours at all. */
@supports not (color: light-dark(#000, #fff)) {
  :host { --bg: var(--fdv-bg, #fbfaf3); --card: var(--fdv-card, #ffffff); --text: var(--fdv-text, #111111); --muted: var(--fdv-muted, #5f5f5f); --border: var(--fdv-border, #d8d5c7); --field-border: var(--fdv-field-border, #8d8878); --accent: var(--fdv-accent, #503aa8); --accent-soft: var(--fdv-accent-soft, #efebfa); --btn: var(--fdv-btn, #111111); --btn-on: var(--fdv-btn-on, #ffffff); --pass: var(--fdv-pass, #16704a); --pass-bg: var(--fdv-pass-bg, #e2f1e8); --fail: var(--fdv-fail, #b3261e); --fail-bg: var(--fdv-fail-bg, #fbe7e4); --warn: var(--fdv-warn, #7d5300); --warn-bg: var(--fdv-warn-bg, #fbf0cf); --code-bg: var(--fdv-code-bg, #f3f1e6); }
}
* { box-sizing: border-box; }
.fdv { background: var(--card); border: var(--fdv-frame, 1px solid var(--border));
  border-radius: var(--r-card); padding: var(--fdv-padding, 26px 28px); }
a { color: var(--accent); text-underline-offset: 2px; }
a:hover { text-decoration: none; }
h2, h3, h4 { font-weight: 400; letter-spacing: -0.1px; line-height: 1.125; }
h2 { margin: 0 0 14px; font-size: var(--fs-large); }
button { font: inherit; }
button:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; }
.cv-mode { font-variant-ligatures: none; }
.co-name { overflow-wrap: anywhere; }
.chip { display: inline-block; padding: 2px 8px; border-radius: var(--r-ctl);
  font-size: calc(0.72 * var(--rem)); font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; }
.muted { color: var(--muted); font-size: calc(0.86 * var(--rem)); font-weight: 400; }
.fdv-message { margin: 0; }
.fdv-message.error { color: var(--fail); }
.patient-card { background: var(--accent-soft); border: 1px solid var(--border);
  border-radius: var(--r-card); padding: 14px 16px; margin: 12px 0 6px; }
.patient-name { font-size: var(--fs-large); }
h3.cv-sec { margin: 22px 0 4px; font-size: var(--fs-large); }
h4.cv-subsec { margin: 12px 0 0; font-size: calc(0.95 * var(--rem)); }
.cv-items { list-style: none; padding: 0; margin: 4px 0 10px; }
.cv-items li { padding: 8px 2px; border-bottom: 1px solid var(--border); }
.cv-items li:last-child { border-bottom: none; }
.cv-label { font-weight: 600; }
.cv-detail { font-size: calc(0.85 * var(--rem)); }
.cv-note, .tl-note { font-style: italic; }
.cv-note { font-size: calc(0.85 * var(--rem)); }
.cv-status { display: inline-block; font-size: calc(0.68 * var(--rem)); font-weight: 600;
  color: var(--muted); border: 1px solid var(--border); border-radius: var(--r-ctl);
  padding: 0 6px; margin-left: 6px; vertical-align: middle; }
.warn-banner { padding: 10px 14px; border-radius: var(--r-card); color: var(--fail);
  background: var(--fail-bg); border: 1px solid var(--fail);
  margin: 0 0 14px; font-weight: 600; }
.cv-sub { font-size: calc(0.8 * var(--rem)); color: var(--muted); font-weight: 400; }
/* View switcher. It lives on the open document rather than in the picker card
   so the control sits next to what it changes: floated so the title flows
   beside it, sticky so it survives scrolling a long summary. */
.cv-modes { float: right; position: sticky; top: 12px; z-index: 2;
  display: flex; margin: 0 0 10px 18px; background: var(--card);
  border: 1px solid var(--field-border); border-radius: var(--r-ctl);
  overflow: hidden; }
.cv-mode { background: transparent; color: var(--muted); border: none;
  border-left: 1px solid var(--field-border); border-radius: 0;
  padding: 6px 13px; font-size: calc(0.82 * var(--rem)); font-weight: 600;
  letter-spacing: -0.1px; cursor: pointer; white-space: nowrap; }
.cv-mode:first-child { border-left: none; }
.cv-mode:hover { color: var(--accent); background: transparent; }
.cv-mode.active { background: var(--btn); color: var(--btn-on); }
/* Floating it here would leave the title a useless sliver, so it goes back to
   being a full-width row above the document. A phone can be narrower than the
   three labels, so they wrap onto further rows instead of being clipped; the
   separator is a shadow up and to the left, which the box clips at its edges
   and so only shows between buttons, across rows as well as along them. */
@media (max-width: 640px) {
  .cv-modes { float: none; position: static; margin: 0 0 12px; flex-wrap: wrap; }
  .cv-mode { flex: 1 1 auto; text-align: center; border-left: none;
    box-shadow: -1px -1px 0 var(--field-border); }
}
/* the float is the last thing in the card, so the card has to be told to
   contain it or it collapses behind the buttons */
.fdv::after { content: ""; display: block; clear: both; }
.chip.cvc { margin-left: 5px; text-transform: none; letter-spacing: 0; }
/* pinned above every view: what is always critical (red), then what is
   outdated or missing and has to be checked now (yellow) */
.cv-context { margin: 6px 0 0; font-size: calc(0.85 * var(--rem)); }
.cv-steps { margin: 4px 0 2px; font-size: calc(0.83 * var(--rem)); }
.cv-steps-head { font-size: calc(0.7 * var(--rem)); font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.06em; }
.cv-steps ol { margin: 2px 0 0; padding-left: 1.5em; }
.cv-steps ol li { padding: 1px 0; border-bottom: none; }
.cv-critical .cv-steps { color: var(--text); }
.cv-performer { margin: 2px 0 0; font-size: calc(0.8 * var(--rem)); }
.cv-quality { margin: 16px 0 0; padding-top: 8px; border-top: 1px solid var(--border);
  font-size: calc(0.8 * var(--rem)); color: var(--muted); }
.cv-pinned { margin: 12px 0 4px; }
.cv-critical, .cv-attention { border: 1px solid var(--fail); background: var(--fail-bg);
  border-radius: var(--r-card); padding: 10px 14px; }
.cv-attention { border-color: var(--warn); background: var(--warn-bg); }
.cv-critical + .cv-attention { margin-top: 6px; }
.cv-crit-head { font-size: calc(0.72 * var(--rem)); text-transform: uppercase; letter-spacing: 0.1em;
  font-weight: 700; color: var(--fail); margin-bottom: 4px; }
.cv-attention .cv-crit-head { color: var(--warn); }
.cv-pinned ul { list-style: none; margin: 0; padding: 0; }
.cv-pinned li { padding: 4px 0; border-bottom: 1px solid var(--border); }
.cv-pinned li:last-child { border-bottom: none; }
.cv-crit-gap { color: var(--fail); }
.cv-critical .cv-note { color: var(--text); }
.cv-att-date { font-size: calc(0.8 * var(--rem)); color: var(--muted); margin-left: 4px;
  font-variant-numeric: tabular-nums; }
.cv-basis { font-size: calc(0.72 * var(--rem)); color: var(--muted); margin-left: 8px;
  vertical-align: middle; }
.cv-crit-cat { font-size: calc(0.72 * var(--rem)); color: var(--muted); font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; margin-right: 4px; }
.chip.risk { color: var(--fail); background: var(--fail-bg); }
.chip.warn { color: var(--warn); background: var(--warn-bg); }
.chip.ok { color: var(--pass); background: var(--pass-bg); }
.chip.gap { color: var(--muted); background: var(--code-bg); border: 1px solid var(--border); }
.db-note { list-style: none; font-size: calc(0.8 * var(--rem)); color: var(--muted); margin: 0 0 6px; }
.cv-narrative p { margin: 2px 0 8px; font-size: calc(0.9 * var(--rem)); }
.db-prose p { margin: 4px 0 6px; font-size: calc(0.82 * var(--rem)); }
/* category colours, shared by timeline dots and legend */
.c-alert { --cat: #e3362b; }
.c-allergy { --cat: #d64545; }
.c-problem { --cat: #c07a10; }
.c-medication { --cat: #3f7fd6; }
.c-result { --cat: #1f9d6b; }
.c-procedure { --cat: #b45ab0; }
.c-immunization { --cat: #12a3a3; }
.c-device { --cat: #a05a2c; }
.c-plan { --cat: #7b7488; }
.c-other { --cat: #928d9b; }
.cdot { display: inline-block; width: 9px; height: 9px; border-radius: 50%;
  background: var(--cat, var(--accent)); margin-right: 5px; vertical-align: middle; }
/* B - timeline */
.tl-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: calc(0.78 * var(--rem));
  color: var(--muted); margin-top: 10px; }
.tl { position: relative; margin: 10px 0 0; padding-left: 22px; }
.tl::before { content: ""; position: absolute; left: 5px; top: 6px; bottom: 6px;
  width: 2px; background: var(--border); }
.tl-year { position: relative; font-weight: 700; font-size: calc(0.9 * var(--rem)); margin: 16px 0 4px;
  font-variant-numeric: tabular-nums; }
.tl-year::before { content: ""; position: absolute; left: -21px; top: 5px;
  width: 12px; height: 12px; border-radius: 50%; background: var(--muted);
  border: 2px solid var(--card); }
.tl-row { position: relative; padding: 7px 0; border-bottom: 1px solid var(--border); }
.tl-row:last-child { border-bottom: none; }
.tl-row::before { content: ""; position: absolute; left: -20px; top: 13px;
  width: 10px; height: 10px; border-radius: 50%; background: var(--cat, var(--accent));
  border: 2px solid var(--card); }
.tl-year.tl-upcoming::before { background: var(--accent); }
/* hollow dot: the date comes from the free text, not from a coded field */
.tl-row.tl-noted::before { background: var(--card);
  border-color: var(--cat, var(--accent)); }
.tl-pin { color: var(--fail); font-weight: 600; }
.tl-date { font-size: calc(0.74 * var(--rem)); color: var(--muted); font-variant-numeric: tabular-nums; }
.tl-label { font-weight: 600; }
.tl-detail { font-size: calc(0.83 * var(--rem)); color: var(--muted); }
.tl-undated { border: 1px dashed var(--warn); border-radius: var(--r-card); padding: 10px 14px;
  margin-top: 18px; background: var(--warn-bg); }
.tl-asserted { border: 1px dashed var(--border); border-radius: var(--r-card);
  padding: 10px 14px; margin-top: 18px; background: var(--code-bg); }
/* C - dashboard */
.db-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px; margin-top: 12px; align-items: start; }
/* problems, medication and responsibility are read against each other */
.db-grid.db-trio {
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); }
.db-card { border: 1px solid var(--border); border-radius: var(--r-card); padding: 12px 14px;
  background: var(--bg); }
.db-card.alert { border-color: var(--fail); background: var(--fail-bg); }
.db-card.good { border-color: var(--pass); }
.db-card h4 { margin: 0 0 8px; font-size: calc(0.72 * var(--rem)); text-transform: uppercase;
  letter-spacing: 0.1em; font-weight: 700; color: var(--muted); }
.db-big { font-size: var(--fs-x-large); line-height: 1.15; }
.db-sub { font-size: calc(0.8 * var(--rem)); color: var(--muted); }
.db-list { list-style: none; margin: 6px 0 0; padding: 0; font-size: calc(0.87 * var(--rem)); }
.db-list li { padding: 4px 0; border-bottom: 1px solid var(--border); }
.db-list li:last-child { border-bottom: none; }
.db-more { font-size: calc(0.76 * var(--rem)); color: var(--muted); margin-top: 5px; }
.db-list li > .db-more { margin-top: 0; }
.db-list li > .db-note { margin: 2px 0 0; }
.db-detail { font-size: calc(0.8 * var(--rem)); }
.db-subhead { font-size: calc(0.72 * var(--rem)); font-weight: 700; color: var(--muted);
  margin: 12px 0 0; }
.db-list.db-quiet { font-size: calc(0.8 * var(--rem)); margin-top: 2px; }
.db-quiet .db-detail { color: var(--muted); }
.db-state { color: var(--muted); }
.db-plan-label { font-weight: 600; }
.db-fact { font-size: calc(0.8 * var(--rem)); }
.db-k { display: inline-block; min-width: 3.6em; font-size: calc(0.7 * var(--rem)); font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.db-cancelled .db-status { color: var(--fail); font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; }
.db-currency { font-size: calc(0.8 * var(--rem)); color: var(--muted); margin: 6px 0 0; }
.db-currency.stale { color: var(--warn); background: var(--warn-bg);
  border-radius: var(--r-ctl); padding: 5px 8px; font-weight: 600; }
.mt { margin-top: 9px; }
.mt-top { display: flex; justify-content: space-between; font-size: calc(0.78 * var(--rem));
  font-weight: 600; }
.meter { height: 7px; border-radius: var(--r-ctl); background: var(--border);
  overflow: hidden; margin: 4px 0 0; }
.meter > span { display: block; height: 100%; background: var(--pass); }
.meter.mid > span { background: var(--warn); }
.meter.low > span { background: var(--fail); }
`;
