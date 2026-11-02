# Purple workspace and recognition / coach verification

The one-screen structure, component geometry, physics solver, existing controls, API URL and Pages workflow remain in place. The presentation uses the supplied amethyst palette: page #1B0E30, navigation #26133F, upload #422765, conversation #3B215D, canvas #1A0E31, sidebar #492B6D and statistics #412660. Core readings are 29px/700 on desktop; numeric inputs are 19px; SVG labels retain readable screen sizes. Uploaded images and the black-and-white mascot keep their original colors.

## Coach corrections

Source-reading questions now include the original image, selected component and up to eight bounded visible conversation turns. Original givens, current tuned values, and calculated results are separate context. Numeric assignments inside a request to read, check, or refrain from editing no longer trigger local edits. The server rejects model operations for a read-only request and permits one repair attempt. Asking for a solution alone does not authorize filling. Explicitly filling one component leaves the other parameters unchanged. Unconfirmed recognition candidates cannot automatically produce applied answers.

## Recognition checks

Three tasks overlap: original-page component/value/measurement extraction, diagram-only terminal tracing, and an independent full-page terminal/value trace. Automatic acceptance requires matching electrical incidence, inventory, numeric units and contact evidence. Fingerprints preserve LED/diode/source polarity and the third SPDT contact. A fourth targeted call can recover a failed or conflicting trace; unresolved differences remain review candidates. There is a shared 115-second processing deadline, with existing cancellation and provider error handling. There are still no application visitor/day/burst quotas.

Printed labels are retained verbatim instead of treating numerical labels such as “4k” as printed component IDs. Generic A/V symbols inside meters are not unique IDs. Only generated IDs may be aligned with another trace; printed IDs remain constraints. Inventory measurements are remapped with component IDs. Small capacitance comparisons use relative tolerances instead of tolerances intended for ohms. SI conversions and unknown values retain their existing rules.

The image resolution, original upload, prepared diagram crop and pixel-based ordinary-switch checks are retained. The current [DeepSeek vision documentation](https://api-docs.deepseek.com/guides/vision/) and [thinking controls](https://api-docs.deepseek.com/guides/thinking_mode/) were checked before the targeted trials. Images and raw responses used in development remain in ignored private storage and are not committed.

## Validation

Results and timing for the selected final configuration are recorded in `docs/evidence/purple-v8/acceptance.json`. These are targeted regression examples, not a population accuracy estimate or a guaranteed service latency. Desktop/mobile UI checks use mocked requests; real recognition and coach checks are recorded separately. No paid requests run in GitHub Actions.
