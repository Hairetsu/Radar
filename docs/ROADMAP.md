# Radar roadmap

Radar already has the first complete workbench loop: capture, inspect, intercept, replay, automate, map, record findings, run workflows, extend locally, and operate through a visible AI companion. The next work is about trust and depth. Adding another tab is easy. Making Radar dependable on a real engagement is the harder and more useful job.

This is the only active planning document. It records outcomes, not implementation history. Completed plans and audits remain available in Git history.

## Product direction

Radar should become a daily local-first workbench for authorized web testing. Manual-First and AI-First must remain two ways to use the same evidence and safety model.

The non-negotiables are stable:

- Project data stays local unless the operator exports it or sends selected context to an AI provider.
- Saved Scope is authoritative for evidence visibility and AI-First actions.
- Active work has explicit request, concurrency, payload, delay, timeout, and runtime limits.
- AI actions remain visible in the browser and workbench.
- Findings cite durable local evidence and remain reviewable.
- Plugins and workflows cannot bypass IPC validation, Scope, replay limits, or audit logging.

## Shipped baseline

Radar currently includes:

- Project and session persistence with migrations, demo data, notes, saved views, search, bundle import/export, and handoff packages.
- HTTP/S and WebSocket capture through a managed browser or local proxy.
- Scoped query filters, tags, comments, bulk actions, a sitemap, and session diff.
- Request and response interception with match/replace rules and evidence metadata.
- Multi-tab Repeater with environments, collections, history, response diff, burst replay, and WebSocket replay.
- Bounded Automate sessions with explicit markers, payload sets, clustering, match/extract rules, and promotion.
- Findings, report presets, dedupe suggestions, assignment fields, evidence appendices, and retest matrices.
- Declarative workflows with visual review, conditions, templates, dry run, revision history, and scoped active steps.
- Local plugins with manifest validation, explicit permissions, bounded SDK actions, no-script panel preview, trust labels, and audit records.
- Advanced GraphQL, API import, auth, identity, parameter, secret, cache, CORS, host, and redirect signals.
- A separate AI Operator with run profiles, task history, Mission Graph, capability grants, durable receipts, recovery, run memory, and completion reports.
- A Harborline Operator benchmark with versioned prompts, hidden expected evidence, policy-aware scoring, isolated Electron runs, and model-by-profile matrices.
- Unit coverage gates, Electron workflow regression, deterministic fixtures, visual baselines, platform checks, containers, and a human UI release review.

## Autonomous assessment specification

### Decision

Radar should add an **Autonomous Assessment** profile. After one explicit start confirmation, the profile can plan experiments, generate bounded payloads, send them through Repeater or Automate, compare the results, verify promising signals, and create draft findings. It can continue without another prompt while every action stays inside the assessment contract that the operator approved.

"Autonomous" does not mean unrestricted. Radar remains the authority, request builder, dispatcher, recorder, and stop controller. The model chooses hypotheses and experiments. It never receives a general HTTP client, a shell, silent Scope expansion, or authority to improvise business-side effects.

### Where the current operator stops

The Goal-Driven Assessment profile already provides a ten-minute run, 40 tool calls, 10 single replays, 10 active workflow requests, and 100 captures. It can send one Repeater request and run an existing workflow after capability approval. It can prepare Automate controls, but it cannot start or supervise an Automate session.

This leaves four practical gaps:

- The planner works one tool call at a time instead of one test experiment at a time.
- Replays do not have a required baseline, mutation record, comparison, or verification step.
- The operator must approve active work after the run has already started. There is no mission-level authority contract for a complete test pass.
- AI run findings are not yet the same durable draft findings, Repeater history, Automate results, and regression workflows used by Manual-First.

The first autonomy release should close these gaps. Adding more payload strings before the experiment and evidence model exists would make the operator noisier, not better.

### What the operator approves

Before Radar sends an autonomous probe, the operator reviews an assessment contract. **Arm & Run** confirms that contract and creates one run-level capability lease. Matching actions do not pause for more approval. An action that needs more authority stays queued and asks for a contract change.

The contract contains:

| Bound | Required decision |
| --- | --- |
| Targets | Saved Scope origins plus included and excluded path prefixes. Scope still cannot expand from a goal or model decision. |
| Evidence seeds | The capture IDs, Repeater tabs, workflows, and identities that the run may use as request sources. |
| Endpoint impact | Read-only, authentication, state-changing, or unknown. Unknown endpoints are not autonomous. |
| Probe families | Exact families such as CORS, reflection, injection signal, authorization, traversal, or SSRF. |
| Methods | Allowed methods for each endpoint. A method alone never proves that an endpoint is read-only. |
| Request budget | Total probe requests, requests per origin, delay, runtime, timeout, concurrency, and payload-byte limits. |
| Identity | The exact Identity Lab profile or current session state used by each experiment. |
| Context | Whether the provider can receive raw headers and bodies. Raw context remains off by default. |
| External interaction | The approved callback service and allowed callback origin, or no external interaction. |

Radar should offer four authority levels:

| Level | Behavior |
| --- | --- |
| **Observe** | Read captures, browser state, sitemap, Advanced summaries, and saved results. Send nothing. |
| **Read-only probes** | Send GET, HEAD, OPTIONS, and operator-classified read-only requests. Generate no intended persistent state change. |
| **Approved active probes** | Run selected higher-risk families against exact endpoints and identities within stricter budgets. |
| **Manual only** | Perform destructive work, account or profile changes, purchases, messages, uploads, password changes, or any endpoint with unknown impact. |

The default Autonomous Assessment contract uses **Read-only probes** with one concurrent request. The operator can enable **Approved active probes** by family. Radar must not infer this authority from a broad goal such as "find every vulnerability."

### The model plans experiments, not raw requests

One experiment is the smallest autonomous unit. The planner chooses an existing capture, states a hypothesis, selects a probe family, names the parameter or request element to change, and predicts the useful difference. Radar then owns the request sequence.

Each experiment follows this loop:

1. Select one in-scope capture with a known endpoint impact and identity.
2. Replay or reuse a recent normal response as the baseline.
3. Apply one typed mutation or one bounded payload set.
4. Send variants sequentially through the existing replay or Automate controller.
5. Compare status, normalized headers, redirects, latency, body shape, JSON fields, and stable text changes.
6. Classify the result as negative, inconclusive, supported, or verification required.
7. Run a different confirming probe before promoting a vulnerability claim.
8. Record coverage, evidence references, request cost, and the next hypothesis.

The provider receives the experiment result after the sequence settles. It does not spend one planner turn on each payload. This keeps the single effect-bearing operator, reduces model cost, and makes a test repeatable without the original provider.

### Build requests from captured evidence

The model should not reconstruct a full authenticated request from redacted prompt text. It selects a durable capture ID and typed mutations. The Electron main process loads the exact stored request, resolves its environment and identity, applies the mutations, validates the result, and sends it.

The first mutation contract should support:

- Replace, remove, or append one query parameter.
- Replace one JSON, form, multipart, GraphQL variable, cookie, or header value by a parsed path.
- Replace one path segment while keeping the origin fixed.
- Remove an authentication header or cookie for an authorization comparison.
- Set an Origin, Host, forwarded-host, or method value only when the selected probe family permits it.
- Apply a reviewed encoding chain such as URL encoding, JSON escaping, Base64, or case variation.

Every mutation stores the source capture ID, the original value hash, the changed location, the exact payload, the encoding chain, and the resulting capture ID. Secrets can remain in the main process even when the request reuses them. Raw-context opt-in controls what the provider sees, not whether Radar can replay an authorized request.

### Bound generated payloads by family

Radar should keep payload policy in a versioned local probe-family registry, not only in the system prompt. A family defines its allowed mutations, endpoint impact, request cost, payload grammar, stop conditions, comparison rules, and finding gate.

The model may choose values inside that grammar. It cannot change the method, origin, second destination, concurrency, or side-effect class unless the family and assessment contract allow the change. Radar records whether a payload came from a built-in template or model-selected family values.

The first families should be:

| Family | Minimum authority | Initial behavior |
| --- | --- | --- |
| CORS origin handling | Read-only probes | Compare absent, expected, and untrusted Origin requests. Confirm reflection only when credentials and origin behavior support the claim. |
| Reflection context | Read-only probes | Use unique inert canaries and classify HTML, attribute, script, JSON, and header reflection. Do not claim XSS from reflection alone. |
| Injection signals | Read-only probes | Use syntax-error and Boolean pairs on search, filter, and lookup inputs. Exclude time delays and destructive statements from the default family. |
| Authorization omission | Read-only probes | Compare the normal request with removed authorization state. Require expected-denial evidence before calling an access gain. |
| Resource ID substitution | Read-only probes | Use observed IDs and Identity Lab lineage. Treat same-status responses as insufficient without a resource or tenant difference. |
| Path normalization and traversal | Approved active probes | Use bounded traversal variants on operator-approved read endpoints. Record any returned sensitive content locally and redact provider context by default. |
| Authentication tampering | Approved active probes | Test only a selected login or token endpoint with a small payload budget. Never perform password spraying or credential stuffing. |
| SSRF destination handling | Approved active probes | Use only contract-approved private, link-local, or callback targets. No arbitrary public destination can come from the model. |
| Time-based checks | Approved active probes | Use short delays, baseline timing bands, and a low request cap. Stop when target latency or error rate rises. |
| DOM execution canary | Approved active probes | Use a non-network canary and observe it through the managed browser. Never exfiltrate data or persist a payload. |

State-changing mass assignment, file upload, purchase, message-send, profile update, and account-management tests remain Manual-First in the first release. A later release can automate an exact endpoint only when the operator supplies a disposable identity and a tested reset workflow.

Radar will not add autonomous denial-of-service, race, request-smuggling, deserialization, remote-code-execution, shell, destructive file, or persistence payloads. These need separate designs and are not a larger checkbox in this profile.

### Add experiment-level tools

The planner needs a small set of new tools. These tools reuse existing Manual-First operations and stay visible in the workbench.

| Tool | Behavior |
| --- | --- |
| `getAssessmentCandidates` | Returns ranked in-scope capture IDs, endpoint impact, parameter shapes, identities, prior coverage, and applicable probe families. It omits raw secret values. |
| `runReplayExperiment` | Creates or selects a visible Repeater tab, runs a baseline and up to eight sequential variants, stores every history entry, and returns a structured comparison. |
| `runAutomateExperiment` | Starts the existing Automate controller with a validated capture seed, markers, payload family, rules, and AI-specific caps. The runtime waits for a terminal state without model polling. |
| `getAssessmentProgress` | Returns the queued, running, completed, skipped, and blocked experiments plus exact remaining request and runtime budgets. |
| `saveFindingDraft` | Creates a normal **06 Findings** draft only after the deterministic family gate and general AI evidence gate both pass. |

The existing `sendReplay` remains useful for one confirming request. The new tools do not add an arbitrary URL fetch, arbitrary JavaScript, shell, plugin execution, or raw socket tool.

`runAutomateExperiment` should begin with 25 requests, one concurrent request, a required delay, and one parameter position. Radar can raise those caps after regression and rate-limit evidence supports the change. The normal Manual-First Automate limits remain unchanged.

### Make authority account for every request

The current policy tracks single replays and workflow requests separately. Autonomous Assessment needs one probe-request ledger across Repeater, Automate, and active workflows.

The ledger reserves the full normalized cost before dispatch. Each baseline and variant consumes one request. The receipt records the experiment ID, probe family, source capture, origin, method, path, identity, payload bytes, and terminal capture ID. A family cannot hide several sends behind a cost of one.

Run-level capability grants also need the probe family, source capture IDs, endpoint impact, and approved path bounds. Expanding an existing one-path lease to every path on an origin is too broad for autonomous payload work.

### Stop before a run becomes noisy

Radar stops queued traffic and pauses the planner when any of these conditions occurs:

- The operator clicks **Stop Traffic Now**, Scope changes, the assessment contract changes, or authority expires.
- The next request exceeds a total, per-origin, payload, timeout, delay, concurrency, or runtime limit.
- A redirect leaves Scope or the assessment contract.
- The browser identity or authentication fingerprint changes unexpectedly.
- The target returns repeated 429 or 503 responses, a configured number of consecutive network failures, or a sustained latency increase over the baseline band.
- A response exceeds the configured capture limit or an Automate session exceeds its result limit.
- Radar cannot classify the endpoint impact or cannot prove that the exact mutation matches the approved family.
- An active request has an ambiguous outcome. Radar records the uncertainty and does not retry it automatically.

**Pause After Current Request** lets the in-flight request settle, checkpoints the experiment, and prevents the next dispatch. **Stop Traffic Now** aborts Radar-owned requests, clears the experiment queue, revokes run authority, and leaves completed evidence intact.

### Treat evidence as the product

Every autonomous experiment must produce durable local lineage:

- Run, mission objective, hypothesis, experiment, and probe-family IDs.
- Source capture, baseline capture, variant capture, Repeater history, Automate result, workflow result, and capability receipt references.
- Identity and authentication fingerprint used for the request.
- Exact mutation and payload, with sensitive response content redacted only at the provider boundary.
- Expected observation, actual comparison, falsifiers, retry decision, and final classification.
- Request cost, timestamps, stop reason, and coverage state.

A single 500 response, status change, response-length outlier, reflected string, or model judgment is a lead. It is not a finding. Promotion requires the family-specific gate, a confirming probe that changes one condition, reproducible evidence, affected assets, impact rationale, remediation, uncertainty, and local evidence references.

Authorization findings need identity or expected-denial evidence. Injection findings need a control pair and a second confirming behavior. Timing findings need repeated baseline and treatment bands. Reflection findings remain candidates until Radar observes executable context or another concrete impact.

Negative and contradictory results update the coverage matrix. An untested, blocked, skipped, or inconclusive endpoint never appears as passed.

### Ask follow-up questions about a completed assessment

A completed assessment should remain promptable. When the operator selects a completed run, the composer shows **Ask About This Assessment** and anchors the prompt to that run. The prompt can ask for an explanation, a narrower analysis, a retest, or more investigation.

Radar should use one follow-up flow:

1. The operator selects a completed run and enters a new prompt.
2. Radar creates a new linked run and loads a bounded assessment digest from the source run.
3. The planner answers from existing evidence when the prompt needs no new traffic.
4. If the prompt needs new probes, the planner prepares a new assessment contract and pauses before any send.
5. After approval, the follow-up run collects fresh baselines and evidence. It does not treat source-run evidence as a current retest.

The assessment digest contains the source goal, completion report, findings, observations, limitations, assessment contract, experiment summaries, coverage, unresolved hypotheses, request ledger, and valid local evidence references. It excludes the full transcript and raw secrets. The planner can request specific source evidence by durable reference when more detail is needed.

The UI should make the relationship obvious:

- Task History shows the source run and its follow-up runs as a small tree.
- The composer shows a removable **Based on run** chip with the source goal, completion time, and finding count.
- The first Operation Stream card records which assessment digest was loaded.
- The Completion Report separates inherited observations from evidence collected during the follow-up.
- **New Mission** clears the source relationship and starts without assessment context.

A budget continuation and an assessment follow-up are different operations. `continuationOf` keeps the same goal and profile after budget exhaustion. A follow-up uses a new prompt and a typed source relationship such as `{ kind: "assessment-follow-up", sourceRunId }`. Do not overload `continuationOf` or infer the relationship from prompt text.

A follow-up receives fresh budgets, capabilities, receipts, and an assessment contract. It never inherits a granted capability lease. Radar rejects a missing source run, a source from another project, invalid evidence references, or raw source context that the new run did not permit.

The first release can use one source assessment in the active project. Later work can compare two assessments or follow a finding across sessions, but the prompt must name those sources explicitly.

Harborline should prove both paths:

- "What evidence made the cargo-search result more than a syntax error?" answers from the source digest without sending traffic.
- "Retest the cargo search with encoded Boolean variants" prepares a new contract, then records a fresh baseline and variants after approval.
- "Investigate the skipped profile update" does not inherit authority. The follow-up remains blocked because the endpoint is state-changing under the default contract.

### Keep the autonomous run visible

The AI Operator should present experiments, not a wall of planner turns:

- The composer adds an assessment contract deck with targets, exclusions, identities, families, rate, request cap, runtime, and raw-context state.
- Mission Pulse shows the current family, endpoint, identity, request number, and stop condition.
- Operation Stream groups Decide, Baseline, Mutate, Compare, Verify, and Record under one experiment card.
- Mission Inspector adds an **Assessment** tab for the queue, coverage, rate, remaining request cost, and skipped endpoints. Graph, Authority, Report, and Memory remain available.
- The main workspace switches to Repeater or Automate and shows each draft, send, response, and comparison as it happens.
- One persistent **Stop Traffic Now** control remains visible in both windows during active traffic.
- The Completion Report separates verified findings, supported leads, contradicted hypotheses, negative coverage, skipped work, and exact remaining gaps.

Exact payloads and responses remain selectable evidence. Radar masks secret-shaped values in provider context and collapsed summaries, but the authorized local workbench can reveal the recorded request to the operator.

### Fit the existing architecture

The implementation should keep the current single sequential effect-bearing operator.

- `shared/agentAssessment/` owns serializable contracts, branded IDs, probe-family metadata, mutation normalization, cost estimates, comparison types, and pure finding gates.
- `electron/agent/assessment/` owns candidate ranking, experiment scheduling, checkpoint recovery, and the adapter to replay, Automate, workflow, capture, and finding controllers.
- `electron/agent/toolRegistry/` remains the only public tool schema and normalization source.
- `electron/replay/`, `electron/automate/`, and `electron/workflows/` remain the only request executors. The assessment runner cannot call `fetch` directly.
- `src/hooks/workbench/agent/` projects experiment progress into the visible Repeater, Automate, Findings, and AI Operator state.
- `src/ai-operator/` renders the contract, queue, grouped experiment stream, coverage, and kill switch.

`AgentRun` should gain a bounded `assessment` state containing the approved contract, queue, experiment summaries, request ledger, and current controller reference. Store references to captures and tool results, not duplicate raw request and response bodies. Persist the state with the run so a restart can resume without resending a completed or ambiguous probe.

The planner remains provider-independent. Deterministic candidate extraction, request mutation, response comparison, and finding gates must work without an AI provider so they can be unit-tested and reused by Manual-First.

### Ship the smallest useful slices

1. **Autonomous Repeater core.** Shipped: contract deck, probe-request ledger, candidate extraction, `runReplayExperiment`, visible Repeater history, checkpoints, and stop controls for CORS, reflection, injection-signal, authorization-omission, and resource-ID families.
2. **Autonomous Automate.** Add the local probe-family registry, `runAutomateExperiment`, live progress, clustering, adaptive follow-up within the same family, and path-traversal probes. Keep one concurrent request and a 25-request cap.
3. **Verification and follow-up.** Add family-specific gates, a separate verification pass, assessment digests, promptable completed runs, normal Findings drafts, negative coverage, and finding-to-regression workflow creation.
4. **Higher-risk opt-ins.** Add authentication tampering, SSRF targets, short timing checks, safe DOM canaries, and operator-provided callback correlation. Each family gets its own contract field and regression target.
5. **Reset-backed state changes.** Consider exact state-changing endpoints only after Radar can prove a disposable identity, capture pre-state, run a reviewed reset workflow, and verify restored state.

Each slice must be complete in Manual-First and AI-First. The Manual-First form of an experiment is a reviewed Repeater or Automate experiment with the same family, mutations, limits, comparisons, and evidence gate.

### Prove autonomy on deterministic targets

Harborline is the first acceptance target. After the operator browses the normal workflows, saves local Scope, enables the needed families, and confirms one bounded contract, Radar should:

- Confirm the cargo-search injection behavior with an error probe and a Boolean control pair.
- Record the invoice access result as an authorization lead, and promote it only when identity or tenant evidence proves an unintended access gain.
- Confirm fixed-file disclosure through the approved path-traversal family.
- Record unescaped support markup as a reflection candidate without claiming executable XSS.
- Confirm credentialed Origin reflection through an OPTIONS comparison.
- Test the integration preview only when the operator approves the SSRF family and that exact read-only POST endpoint.
- Skip the profile update in the default contract because it is state-changing.

The release gate also needs a clean target with similar parameters and no vulnerabilities. That run must create no draft findings.

Required automated checks include:

- A malicious or malformed provider decision cannot add an origin, method, family, identity, mutation, or request beyond the contract.
- Instructions embedded in target pages or responses cannot change the contract or trigger an unapproved family.
- Every active request has a reserved request cost and a terminal receipt.
- Scope, path exclusions, auth changes, budgets, rate limits, and the kill switch fail closed.
- Raw-context-off prompts contain no cookie, authorization, token, or stored secret values even when the main process reuses them.
- Restart recovery never resends a completed or ambiguous request.
- A read-only follow-up can answer from the source digest without sending traffic or changing the source run.
- A follow-up cannot inherit source authority, treat old evidence as a fresh retest, or read raw source context without a new opt-in.
- An Automate result cannot promote itself without the family gate and valid local evidence references.
- Operation Stream, Repeater, Automate, Findings, and Completion Report show the same request counts and evidence lineage.

Success means one confirmation can run a useful assessment to completion, not that Radar can claim it tested everything. The completion report must say what was tested, what was skipped, why the run stopped, and which claims survived verification.

### Non-goals

- A general autonomous exploit agent.
- Concurrent browser operators or planner fan-out.
- Silent Scope, identity, endpoint-impact, or capability changes.
- Automatic exploitation to prove maximum impact.
- Provider access to raw secrets when raw context is off.
- A finding based only on model confidence.
- Claims that a clean run proves the absence of vulnerabilities.

## Priority 0: make releases trustworthy

Radar is pre-1.0 and its installers are not yet fully signed. Public trust work comes before claims that Radar can replace a mature proxy.

### Distribution

- Paid Apple notarization and Windows Authenticode signing stay deferred until those certificates exist. Unsigned installers remain the documented pre-1.0 path.
- Publish Linux checksums and verify AppImage, Debian, and Arch packages on matching hosts.
- Add release SBOM and provenance artifacts.
- Add packaged-app smoke tests for every supported operating system.
- Generate release notes with a short human-edited summary.
- Add a local-only update check that sends no project data.

### Public security posture

- `SECURITY.md`, `CONTRIBUTING.md`, issue templates, and `docs/THREAT_MODEL.md` are in the repo.
- Renderer CSP and unused `webviewTag` are constrained in the main process.
- Revisit the documented Electron 42 sandbox exception for both renderer windows.
- Move pasted AI keys from plain JSON to operating-system protected storage.
- Add dependency, license, Electron security, and secret-handling checks to CI.

### First-run clarity

- Add onboarding that can load the demo, explain local storage, show the proxy address, and guide manual certificate trust.
- Put privacy and data-path explanations inside the app, including raw AI context and raw export.
- Add proxy health diagnostics for port use, CA state, browser discovery, Playwright connection, and the last proxy error.

## Priority 1: prove findings independently

The next AI and evidence milestone is independent verification and finding-to-regression.

- Let an operator ask for a separate verification pass over one draft finding.
- Keep the verifier read-only until a narrowly scoped repro needs explicit authority.
- Record supporting, contradicting, and missing evidence without rewriting the original observation.
- Make negative results visible and useful.
- Turn an accepted finding into a saved regression workflow with reviewed inputs and caps.
- Link the workflow result back to the finding and retest matrix.
- Add seeded evaluation cases for unsupported claims, bad references, false confidence, and clean negative results.

Success means a finding can move from observation to independent check to repeatable retest without copying evidence between tools.

## Priority 2: deepen daily proxy work

### History and evidence review

- Add configurable columns, persisted widths, and density presets.
- Add body viewers for raw text, formatted JSON, hex, images, and normalized diff.
- Add retention controls with a clear warning before raw evidence is deleted.
- Add a chronological project event log across proxy, replay, Automate, workflows, plugins, SSL, and AI.
- Add large-dataset renderer tests and virtualize tables only where measurement proves the need.

### Proxy and intercept

- Add upstream proxy settings, authentication, bypass rules, and DNS or host aliases for labs.
- Add a setup wizard for external browsers, CLIs, mobile devices, emulators, and desktop clients.
- Add intercept queue search, grouping, and hold-next controls.
- Add match/replace rule testing, import/export, hit counts, and affected-capture links.
- Add WebSocket match/replace only after the evidence and cancellation model is clear.

### Repeater

- Add semantic JSON, cookie, redirect, timing, and TLS comparisons.
- Add history search across tabs and grouped send with explicit total request cost.
- Add project, session, tab, and one-use variable scopes with masking.
- Preview environment substitution before transmit.
- Add XML, GraphQL, multipart, protobuf, and grpc-web transforms where the format can be handled safely.

### Automate

- Add pitchfork, cluster-bomb, battering-ram, numeric-range, and null payload modes.
- Add visible preprocessing chains for encoding, prefixes, suffixes, replacement, hashing, and JSON escaping.
- Add resumable sessions with crash-safe checkpoints.
- Add baseline comparison, stronger outlier scoring, timing bands, and extracted-value columns.
- Add per-host rate limits, backoff, pause-on-error, maximum runtime, and one visible kill switch.
- Add CSV and Markdown evidence exports alongside JSON.

## Priority 3: autonomous assessment and bounded discovery

Implement the Autonomous Assessment specification above as a visible queue of scoped experiments with budgets and evidence. Active work must remain inspectable in Repeater, Automate, Workflows, the sitemap, and the AI Operator.

- Expand passive checks for mixed content, redirects, disclosure, robots and sitemap files, content type, TLS, CSP, and reflected parameter clues.
- Add low-noise active profiles for method changes, reflection, cache behavior, CORS, host headers, and selected metadata discovery.
- Add a scanner dashboard for coverage, pending checks, skipped origins, issues, and request cost.
- Add crawl planning from links, forms, scripts, OpenAPI references, GraphQL endpoints, and saved identities.
- Add bounded content discovery with wordlists, extension filters, recursion limits, and per-host rates.
- Add tested and untested state to sitemap endpoints without confusing absence of evidence with a passing result.

## Priority 4: focused advanced tools

These tools should be added only when the daily capture and replay loop remains clear.

- Out-of-band interaction support through an operator-provided callback service, with local correlation and evidence linking.
- Browser-side DOM source and sink review, `postMessage`, storage, prototype-pollution clues, frame checks, and safe canaries.
- A page-action recorder that produces a reviewable workflow draft.
- Token sample collection and randomness analysis.
- Dedicated Decoder and Comparer tools for common web formats.
- HAR and raw HTTP import/export.
- Better HTTP/2 and HTTP/3 visibility notes, plus focused gRPC and grpc-web helpers where the underlying libraries support them.

Hosted callback infrastructure is not a prerequisite. If it is ever added, it must be a separate opt-in service and must not receive project data by default.

## Priority 5: harden extensions and workflows

The current plugin API is bounded, but approved entry code still needs a stronger isolation story before Radar encourages third-party packages.

- Run plugin code in an isolated process or a hardened sandbox outside the privileged Electron main process.
- Add SDK documentation, a test harness, package size and dependency checks, and signed first-party packages.
- Add workflow import/export and maintained workflow packs.
- Expand workflow nodes for bounded HTTP, browser, extract, match, transform, delay, loop, finding, note, and report actions.
- Add JavaScript or shell steps only after permission, sandbox, timeout, filesystem, and audit behavior are explicit.

Do not build a public marketplace before package signing, isolation, abuse review, and update verification are in place.

## Work intentionally deferred

- Hosted project sync and collaboration.
- A public plugin marketplace.
- Invisible proxy mode.
- Unbounded AI orchestration.
- Automatic certificate installation.
- Silent scope expansion.

File-based bundles and handoff packages are the collaboration model until local safety and public governance are solid.

## How roadmap work ships

Every user-facing change must land as one vertical slice:

1. Define or update serializable contracts in `shared/`.
2. Add main-process behavior and boundary validation in `electron/`.
3. Expose the narrow preload and IPC path.
4. Build the Manual-First controls and visible state in `src/`.
5. Add or explicitly rule out the AI-First tool or read-only context path.
6. Test the main path, the likely failure, and every changed safety boundary.
7. Update the README, user guide, manual QA, and screenshots when the operator surface changes.
8. Run `pnpm lint`, `pnpm test:unit`, and `pnpm build`, plus the relevant Electron regression gate.

A roadmap item is done when the shipped app and its verification agree. A checked box in a plan is not evidence.
