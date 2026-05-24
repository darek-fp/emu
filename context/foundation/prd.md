---
project: "EMU Parking Manager"
version: 1
status: draft
created: 2026-05-24
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-07-05
  after_hours_only: true
---

## Vision & Problem Statement

Parking managers at small-to-medium lots manage availability and reservations entirely by hand today — notepads, no purpose-built tooling. Three pain vectors compound: workflow friction (manual process wastes time and causes errors), missing capability (no instant check whether a spot is free for a given future window), and data scattered across notes (no single view of current occupancy or upcoming bookings).

A purpose-built web app replaces the notepad with a single source of truth: current occupancy at a glance, availability queries across date ranges, reservation recording with arrival/departure times, tiered pricing, and manual confirmation of vehicle arrival, departure, and payment. The commercial insight: there is a market of parking operators who run on notepads and have no affordable, operator-focused tool — this product targets them.

## User & Persona

**Primary persona:** A parking manager at a small-to-medium parking facility. Handles inbound availability inquiries, records new bookings, confirms arrivals and departures, and collects fees. Currently tracking all of this manually on a notepad. Reaches for this product when a customer asks about availability or when they need today's occupancy state at a glance.

## Success Criteria

### Primary
- A parking manager can configure a parking structure (sectors + spot counts), check availability for a requested date range, create a reservation with customer details and arrival/departure time window, and then mark that reservation as arrived, departed, and paid — without touching a notepad.

### Secondary
- The system surfaces traffic surge warnings: upcoming time windows where the volume of declared arrivals and departures is high enough to suggest more than one operator on duty.

### Guardrails
- Overbooking must be impossible — availability must be enforced at reservation creation time; double-booking a spot for overlapping periods must be prevented by the system.
- Data must not be lost — confirmed reservations, payments, and configuration must persist reliably.
- An operator must always be able to cancel a reservation (no workflow lock-out).

## User Stories

### US-01: Operator creates a reservation

- **Given** a logged-in Operator, and a parking lot with at least one available spot for the requested dates
- **When** the Operator enters customer/vehicle details, arrival date+time, and departure date+time and submits
- **Then** a reservation is created with the calculated price, the spot is marked as unavailable for that window, and the reservation appears in the active reservations list

#### Acceptance Criteria
- System must reject the submission if no spot is available for the requested window (overbooking prevention)
- Price is automatically calculated and displayed before the operator confirms the booking
- Reservation appears immediately in the reservations list upon creation

## Functional Requirements

### Parking Structure

- FR-001: Admin can define the parking structure — either a single undivided lot or multiple named sectors, each with a configured spot count. Priority: must-have
  > Socrates: No counter-argument; stands as written.

- FR-002: Admin can update the parking structure configuration (add/remove sectors, change spot counts). Priority: must-have
  > Socrates: Counter-argument considered: "editing structure creates complexity if active reservations exist for affected spots." Resolution: kept — real lots expand and contract; the app must support it. Constraint added: the system must warn the operator if a structural change conflicts with active reservations.

### Pricing

- FR-003: Admin can define a pricing tier: a base per-day rate, a discount schedule (the longer the stay, the lower the per-day rate), and a minimum price floor per day. Priority: must-have
  > Socrates: Counter-argument considered: "tiered pricing is complex; flat rate would prove the product faster." Resolution: kept — tiered pricing is the core differentiator vs. a notepad; it must ship in MVP.

### User Management

- FR-004: Admin can create and manage Operator accounts (create, deactivate). Priority: must-have
  > Socrates: Counter-argument considered: "single shared login would reduce setup overhead." Resolution: kept — multi-operator with accountability is the product's purpose; shared login defeats that.

### Reservations

- FR-005: Operator can check available spots for a requested date range. Priority: must-have
  > Socrates: Counter-argument considered: "a simple occupancy count would be simpler." Resolution: kept — real-time availability check for a date range is the core capability, not an enhancement.

- FR-006: Operator can create a reservation with: customer name, license plate, arrival date+time, departure date+time. Priority: must-have
  > Socrates: Counter-argument considered: "collecting too many fields slows operators." Resolution: scoped down — customer name + license plate only for MVP; full vehicle details in v2.

- FR-007: System automatically calculates the total price for a reservation based on the declared arrival/departure window and the applicable pricing tier. Operator may manually override the calculated price (override is flagged). Priority: must-have
  > Socrates: Counter-argument considered: "automatic pricing leaves no room for exceptions." Resolution: modified — operator can override with a warning flag; this handles edge cases without undermining the automation.

- FR-008: Operator can view all reservations (past, current, and upcoming) in a reservation list. Priority: must-have
  > Socrates: No counter-argument; operational dashboard is essential.

- FR-009: Operator can cancel a reservation. Cancellations are logged with the cancelling user's identity and timestamp. Priority: must-have
  > Socrates: Counter-argument considered: "a simple delete is sufficient for MVP." Resolution: modified — audit log added; operators need accountability, and this is low cost to implement.

### Arrival / Departure / Payment

- FR-010: Operator can confirm vehicle arrival for a reservation in a single action (no multi-step form). Priority: must-have
  > Socrates: No counter-argument; single-action UX constraint added — confirmation must be a single click, not buried in a form.

- FR-011: Operator can confirm vehicle departure for a reservation in a single action. Priority: must-have
  > Socrates: Same as FR-010; single-action UX constraint.

- FR-012: Operator can confirm payment for a reservation in a single action. Priority: must-have
  > Socrates: Same as FR-010; single-action UX constraint.

### System Rules

- FR-013: System prevents overbooking — rejects reservation creation if any existing reservation's arrival/departure window overlaps (at the hour level, not just calendar-day level) with the requested window for the same spot. Priority: must-have
  > Socrates: Counter-argument considered: "day-level overlap check might be sufficient." Resolution: strengthened — time-of-day overlap must be checked; a spot can be vacated at 10am and re-booked from noon the same day.

- FR-014: System displays a traffic surge warning when the volume of declared arrivals and/or departures in a given time window is notably high. Priority: nice-to-have
  > Socrates: No counter-argument; correctly scoped as nice-to-have; does not block MVP.

## Non-Functional Requirements

- An operator sees a response to an availability check or reservation creation within 1 second under normal load.
- The calculated price for any stay must exactly match the output of the configured pricing tier — no rounding errors or off-by-one day miscounts.
- If two operators attempt to book the last available spot for the same window simultaneously, only one booking must succeed; the second must receive a rejection.
- The product is usable on the latest two major versions of the four mainstream desktop browsers (Chrome, Firefox, Safari, Edge).
- Customer names and license plate numbers are personal data subject to GDPR. Data must not be retained beyond the legally permissible retention window, and operators must be able to delete or anonymize a customer's records on request.

## Business Logic

Given a requested arrival/departure window, the system determines whether a free spot exists — accounting for all existing reservations at the hour level — and, if so, computes the total stay cost according to the tiered pricing schedule.

The rule consumes: the requested window (arrival date+time, departure date+time); the current reservation set for all spots in the relevant sector(s); and the configured pricing tier (base per-day rate, discount steps keyed to stay duration, and a daily minimum price floor). Its output is a binary availability decision plus a calculated price. The operator encounters the rule at reservation creation time: the form either accepts the booking with a price shown, or rejects it with a reason (no availability).

Price calculation detail: stay duration is measured in days (or fractional days). Each day tier applies the applicable discounted rate, floored by the daily minimum. The final price is the sum of per-day amounts across the declared window.

## Access Control

Authentication: email + password login. No public access — all routes require an authenticated session.

Two roles:

- **Admin** — full access: configure parking structure (sectors, spot counts), define and edit pricing tiers, manage user accounts. Can also perform all Operator actions.
- **Operator** — day-to-day access: create and view reservations, confirm vehicle arrival and departure, confirm payment. Cannot modify parking structure or pricing.

Sign-up: accounts are created by an Admin (no self-registration in MVP — operator accounts are provisioned internally).

## Non-Goals

- **No customer-facing accounts or self-service booking portal** — reservations are created by operators on behalf of customers; customers do not access the system directly in MVP. Rationale: the MVP targets operators, not end customers; adding a customer portal doubles the product scope.
- **No automatic vehicle detection** — no camera integration, no license plate recognition system. Arrival and departure are confirmed manually by operators. Rationale: explicitly listed as out of scope; camera integration requires infrastructure beyond the web app.
- **No mobile app** — web only for MVP. Rationale: stated in original scope notes; mobile can follow once the web product is validated.
- **No loyalty or discount programs for repeat customers** — pricing is tier-based on stay duration only; no per-customer discount history. Rationale: adds complexity to the pricing rule without proving core value.
- **No parking zone optimization based on stay duration** — the system does not auto-suggest which sector to assign based on how long the car will stay. Rationale: out of scope for MVP; assignment is operator-driven.
- **No traffic congestion predictions** — traffic surge warnings (FR-014, nice-to-have) surface occupancy patterns from declared times; the system does not attempt to predict external traffic or integrate with external traffic data.

## Open Questions

No open questions at PRD generation time. All shaping phases completed; quality check status: accepted.
