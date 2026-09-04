# Cathay IntentSentinel — Web Frontend Design Specification

## 1. Product intent

IntentSentinel is a live operations surface for two audiences at once:

- An operator demonstrating how an autonomous agent discovers, approves, and pays for an x402 resource.
- A CFO or security reviewer verifying that treasury constraints remain authoritative even when the agent is exposed to hostile content.

The interface must make one architectural fact obvious within five seconds: **the agent can propose a payment, but it cannot sign or settle unless the independent policy boundary approves the exact intent**.

This is a hackathon demo, but the presentation model follows the production separation of concerns:

1. Reasoning proposes a task-bound payment intent.
2. Policy evaluates six deterministic dimensions and fails closed.
3. An isolated scoped key signs only the approved EIP-712 payload.
4. A facilitator verifies, settles, and emits tamper-evident audit events.

## 2. Experience principles

### Decision before decoration

The primary visual story is the policy decision. Green indicates authorization or settled evidence; red is reserved for a stopped threat; blue indicates live network or in-progress infrastructure; amber identifies the non-error HTTP 402 commercial challenge.

### Split-screen causality

The left side is the agent's proposed work. The right side is financial authority and evidence. An action begins on the left and its policy/budget/audit consequences appear on the right.

### Honest evidence

Demo-generated transactions are visibly Base Sepolia testnet records. A real explorer link is only shown for a syntactically valid transaction hash. A denied payment never receives a fake transaction hash: the receipt instead says `Rejected before signing` and `No funds moved`.

### Dense, calm, legible

This is a command center rather than a marketing landing page. Information density is high, but surfaces remain quiet and use whitespace, 1px borders, restrained glows, tabular numbers, and short labels. Animation communicates state transitions, not ambience.

## 3. Information architecture and component hierarchy

```text
App
├─ AmbientGrid (decorative, aria-hidden)
├─ Header
│  ├─ BrandMark + product identity
│  ├─ NetworkBadge (Base Sepolia, chain 84532, live pulse)
│  ├─ TreasuryBalance (CFO operational balance)
│  └─ PolicyGuardBadge (ARMED | DEFENDING)
├─ WorkspaceIntro
│  ├─ Context breadcrumb
│  ├─ Product thesis
│  └─ Trust-boundary explainer
├─ DashboardGrid
│  ├─ LeftPanel — Agent Autonomous Workflow
│  │  ├─ SectionHeader
│  │  ├─ ActiveTaskCard
│  │  │  ├─ task identity and status
│  │  │  ├─ task objective
│  │  │  └─ agent / task cap / expiry metadata
│  │  ├─ PaymentChallengeCard
│  │  │  ├─ HTTP 402 header
│  │  │  └─ resource / amount / verified payee
│  │  ├─ ScenarioActionList
│  │  │  ├─ LegitimatePurchaseButton
│  │  │  ├─ PromptInjectionButton
│  │  │  └─ A2ANegotiationButton
│  │  └─ Pipeline
│  │     └─ PipelineStep × 8
│  └─ RightPanel — CFO Financial Control & Audit
│     ├─ SectionHeader
│     ├─ SummaryGrid
│     │  ├─ BudgetGauge
│     │  └─ PolicyInspector
│     │     └─ PolicyRule × 6
│     ├─ TransactionStream
│     │  └─ TransactionRow × n
│     └─ ThreatPanel (standing-by | blocked-alert)
├─ Footer (testnet disclosure)
├─ StixModal
└─ TxReceiptModal
```

### Ownership boundaries

`App` owns the demo state, scenario orchestration, modal selection, and derived `defending` state. Presentational children receive typed values and callbacks. Shared domain shapes live in `src/types.ts`; immutable seed data and pipeline definitions live in `src/data.ts`.

The component boundary is intentionally ready for a live adapter. A later `useSentinelStream()` can replace local scenario transitions with WebSocket events from the existing CFO server while leaving the visual components unchanged.

## 4. Layout specification

### Desktop: 1024px and above

- Global content maximum: `1600px`.
- Header and content horizontal gutters: `32px`.
- Main dashboard: two columns, approximately `0.88fr / 1.45fr`.
- Minimum practical column widths: agent `390px`, CFO `560px`.
- Inter-column gap: `32px`.
- The right summary row uses `0.78fr / 1.22fr` for budget versus rules.
- Cards use 14px corner radii and a consistent 1px boundary.

### Tablet: 640–1023px

- Dashboard becomes a single column.
- Agent workflow appears before CFO oversight to preserve input → decision chronology.
- Header metrics wrap without changing their order.
- Policy and budget remain side-by-side when space permits; otherwise the browser grid naturally stacks them.

### Mobile: below 640px

- 20px outer gutter.
- Header wraps into brand and status groups.
- Task metadata stays a three-column compact grid.
- Challenge details stack amount below resource.
- Pipeline retains all eight steps; long labels hide while short codes remain visible.
- Modals use the viewport width less 40px and scroll internally.

## 5. Styling tokens

### Color

| Token | Value | Role |
|---|---:|---|
| `cyber` | `#0b0f19` | application background |
| `surface` | `#131b2e` | primary cards and modal surface |
| `line` | `#1f2b48` | borders, dividers, inactive pipeline |
| `cathay` | `#00805E` | primary actions and brand identity |
| `cathay-light` | `#30c69b` | readable green foreground on dark |
| `alert` | `#ef4444` | blocked decisions and critical threats only |
| `accent` | `#3b82f6` | network state, explorer links, active step |
| `emerald` | `#10b981` | passed rules and settled outcomes |
| amber-300/400 | Tailwind palette | HTTP 402 challenge, not a security error |
| slate-200…700 | Tailwind palette | text hierarchy and disabled states |

Color is never the sole indicator: every state also has a label, icon, or shape change.

### Typography

- UI family: `Manrope`, falling back to system sans.
- Evidence/data family: `DM Mono`, falling back to system monospace.
- Page title: 24px / 600 / tight tracking on desktop, 20px on mobile.
- Section title: 18px / 600.
- Card title: 12–16px / 600–700 depending on hierarchy.
- Body: 10–12px at this information density, minimum 1.45 line-height.
- Eyebrows: 9–10px / 700 / uppercase / `0.14–0.22em` tracking.
- Currency and identifiers always use tabular monospace numerals.

### Shape and elevation

- Main card radius: `14px`.
- Buttons: `11px`.
- Tags: `5px`; status pills: `999px`.
- Card border: `1px rgba(31,43,72,.88)`.
- Shadows are dark and shallow. Colored glows are limited to active infrastructure, successful settlement, and active defense.

### Spacing

Base spacing follows a 4px unit. Primary values are 8, 12, 16, 20, 24, and 32px. Cards generally use 20px internal padding; dense rows use 12px vertical padding.

### Motion

- Pipeline step transition: 250–520ms per stage depending on semantic weight.
- Row insertion: 300ms translate/fade.
- Alert reveal: 380ms translate/fade.
- Modal reveal: 220ms scale/fade.
- Live pulse: two seconds; defending pulse: 1.4 seconds.
- `prefers-reduced-motion: reduce` collapses all animation and transition durations.

## 6. Canonical state machine

### Global execution state

```text
                         ┌─────────────────┐
                         │      IDLE       │
                         │ Guard = ARMED   │
                         └────────┬────────┘
                                  │ scenario.run
                                  ▼
                         ┌─────────────────┐
                         │     RUNNING     │
                         │ buttons locked  │
                         └──────┬────┬─────┘
                     allow     │    │ deny at Policy Gate
                               │    ▼
                               │  ┌─────────────────┐
                               │  │     BLOCKED     │
                               │  │Guard=DEFENDING  │
                               │  └────────┬────────┘
                               ▼           │ next scenario.run
                         ┌─────────────────┐│
                         │     SETTLED     ││
                         │ receipt emitted ││
                         └────────┬────────┘│
                                  └─────────┴──► RUNNING
```

Every new run clears the previous transient pipeline and alert presentation but retains historical transaction/denial records.

### Pipeline state per step

Each of the eight stages is `waiting`, `active`, `complete`, or `blocked`:

1. **Request resource** — agent requests the task-bound endpoint.
2. **Payment challenge** — resource server returns `PAYMENT-REQUIRED` / HTTP 402.
3. **Bind intent** — challenge fields are bound to trusted task context.
4. **Policy gate** — six deterministic constraints evaluate fail-closed.
5. **Scoped signature** — isolated vault signs EIP-712 ERC-3009 authorization.
6. **Verify payment** — facilitator performs read-only `/verify`.
7. **Settle onchain** — facilitator submits Base Sepolia settlement.
8. **Resource unlocked** — resource server returns `200 OK` with evidence.

At most one stage is active. Earlier stages are complete. Later stages remain waiting. A denial makes the policy stage blocked; signing, verification, settlement, and delivery never activate.

### Scenario transitions

| Scenario | Challenge | Policy result | Settlement | Treasury effect | Audit effect |
|---|---|---|---|---:|---|
| Legitimate purchase | 0.01 USDC | all six pass | ERC-3009 on Base Sepolia | `-0.01` | settled transaction + receipt |
| Prompt injection | hostile 500 USDC mutation | task, amount, payee fail | never invoked | `0.00` | denial row + STIX 2.1 alert |
| A2A negotiation | initial offer negotiated down 40% | final intent re-bound and passes | discounted amount settles | `-0.036` demo amount | settled transaction + savings context |

## 7. Interaction events

| Event | Source | Preconditions | UI response | Domain consequence |
|---|---|---|---|---|
| `scenario.run.legitimate` | primary action | not running | lock action group; animate all stages | append settlement; decrement balance |
| `scenario.run.attack` | danger action | not running | animate through policy; switch guard to DEFENDING | append policy denial and threat record; no signing |
| `scenario.run.negotiation` | blue action | not running | animate all stages | append discounted settlement |
| `transaction.inspect` | receipt icon | any transaction | open receipt modal | none; read-only |
| `transaction.openExplorer` | Basescan link | valid tx hash | open new browser tab | none; read-only |
| `threat.inspect` | threat CTA | threat exists | open STIX modal | none; read-only |
| `evidence.copy` | copy action | Clipboard API available | copy sanitized JSON/hash | none; no raw evidence exposure |
| `modal.dismiss` | close, backdrop, Escape | modal open | restore body scrolling and close | none |

All scenario buttons remain disabled while a run is active, preventing overlapping timers or a misleading mixed pipeline.

## 8. Component behavior details

### Header

The header stays visually stable while data updates. Treasury balance updates only after confirmed settlement. `Policy Guard` changes from green `ARMED` to red `DEFENDING` only for a denied threat; it never says merely “error.” The network pill always displays both Base Sepolia and chain ID `84532`.

### ActiveTaskCard

Shows the trusted task context against which intent fields are compared. Task ID, task budget, and expiry use monospace. This is not editable in the demo because editing the trusted context and running an agent action are different authorization surfaces.

### PaymentChallengeCard

Amber separates an expected commercial 402 from a system failure. The payee includes a verified dot and human-readable merchant alias. Resource, amount, and payee are the three fields an audience can visually compare against the policy inspector.

### Action buttons

The primary legitimate flow uses Cathay green. The hostile flow uses a thin red boundary and restrained red tint. A2A uses infrastructure blue. Each exposes the financial consequence at the right edge. During execution, the selected action reads `Running policy checks…`; all actions lock until terminal state.

### BudgetGauge

Shows today's committed amount, utilization, available amount, and the daily cap. The visible fill has a 2% minimum so tiny hackathon transactions still demonstrate the gauge. Text continues to report the exact percentage.

### PolicyInspector

The six rows map directly to policy-engine constraints:

1. Task and resource binding.
2. Per-call and task budget.
3. Merchant URL and payee allowlist.
4. Asset/network allowlist.
5. Authorization expiry.
6. Velocity window.

The panel explicitly says `FAIL-CLOSED`. During defense its boundary receives a red emphasis, but the individual configured rules remain readable rather than all turning red.

### TransactionStream

Newest events appear first. Settled rows have a valid testnet hash, explorer link, and inspection action. Denied rows state `no signature created` and `POLICY DENY`; they intentionally do not link to an explorer. The list scrolls internally after roughly four rows so the overall dashboard stays composed.

### ThreatPanel and StixModal

The empty state is positive but quiet: evidence capture is armed. A blocked injection replaces it with a red alert containing the proposed and trusted amounts, OWASP category, and a CTA. The modal shows only sanitized STIX 2.1 JSON, evidence hash, confidence, and disposition. Raw prompts, secrets, signatures, and authorization headers are forbidden.

### TxReceiptModal

For settlements, show reference, time, merchant, amount, network, block, hash, gas sponsorship, and Basescan link. For denial, show a denial receipt and state that custody was never accessed. This lets the same audit affordance work across both financial and security outcomes.

## 9. Accessibility

- All controls are native buttons or anchors with visible keyboard focus.
- Modal uses `role="dialog"`, `aria-modal`, a labelled title, Escape close, and backdrop close.
- Guard changes use `aria-live="polite"`; the threat card uses `role="alert"`.
- Active pipeline stage uses `aria-current="step"`.
- Icon-only receipt and close buttons have explicit accessible labels.
- Body copy and meaningful labels target WCAG AA contrast against the dark surface.
- Animation honors reduced-motion preference.
- No security or payment state relies on color alone.

Production follow-up: add a focus trap and return focus to the opening control when adopting a dialog primitive library.

## 10. Data and integration contract

The initial implementation is a deterministic browser demo and owns no keys. To connect the existing live CFO server:

- Fetch initial state from `GET /snapshot` (or the configured snapshot route).
- Connect to the WebSocket event stream and order events by `sequence`.
- Deduplicate with `eventId` and validate the `previousEventHash` chain.
- Map `budget.reserved`, `budget.committed`, and `budget.released` to the gauge.
- Map `security.*` and `threat.*` to the defense alert.
- Map verified live `txHash` values to explorer URLs only when the network is `eip155:84532` and receipt verification is true.
- Treat mock and shadow settlements as non-explorer evidence; label their mode visibly.
- Never accept signing material, raw prompt content, access tokens, or private keys into frontend state.

Suggested environment contract:

```text
VITE_SENTINEL_HTTP_URL=http://127.0.0.1:4040
VITE_SENTINEL_WS_URL=ws://127.0.0.1:4040/ws
VITE_EXECUTION_MODE=mock
```

Network loss should leave the last verified snapshot visible with a clear `RECONNECTING` badge. It must not optimistically mark any pending payment settled.

## 11. File map

```text
packages/frontend/
├─ DESIGN.md
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ data.ts
   ├─ types.ts
   ├─ styles.css
   └─ components/
      ├─ Header.tsx
      ├─ LeftPanel.tsx
      ├─ Pipeline.tsx
      ├─ RightPanel.tsx
      ├─ BudgetGauge.tsx
      ├─ PolicyInspector.tsx
      ├─ TransactionStream.tsx
      ├─ ThreatPanel.tsx
      ├─ Modal.tsx
      ├─ StixModal.tsx
      └─ TxReceiptModal.tsx
```

## 12. Acceptance criteria

- `npm run dev` starts the Vite app from `packages/frontend`.
- `npm run build` completes TypeScript checking and produces `dist/`.
- All three scenario actions reach a deterministic terminal UI state.
- The attack path stops at Policy Gate and never shows a transaction hash.
- Legitimate and A2A paths update balance, daily spend, audit stream, and receipt.
- Basescan anchors use `target="_blank"` plus `rel="noreferrer"`.
- Both modals close via button, backdrop, and Escape.
- Layout remains usable from 320px to large desktop widths.
- No production credentials, secrets, or signing capability exist in the web package.
