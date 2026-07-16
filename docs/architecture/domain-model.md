# Watson — Domain Model

> Source: PRD v1.0 §5 (entities) and §6 (business rules).
> Entities and rules below come verbatim from the PRD. Relationships the PRD does not state are marked **(interpretation — confirm)** and listed in `docs/decisions/open-questions.md`. Nothing here is final schema.

## 1. Entities (PRD §5)

Organization, User, Team, Client, Contact, Service, Contract, WorkItem, Activity, Ticket, Project, TimeEntry, Conversation, Message, RecurrenceTemplate, Report, ChargeItem, AuditLog.

## 2. Entity Groups

### Identity & Structure
| Entity | Role in the model | Notes |
|---|---|---|
| Organization | Tenant / company root | Single-org (Waxxor) vs multi-tenant is **[open OQ-01]** |
| User | Person operating Watson | Carries one of the 6 roles |
| Team | Grouping of users | Purpose (assignment? reporting?) **[open OQ-02]** |

### Commercial
| Entity | Role in the model | Notes |
|---|---|---|
| Client | Company being served | Center of the Client 360 experience |
| Contact | Person at a client | Belongs to Client (interpretation — confirm) |
| Service | Offering delivered to clients | Relationship to Contract/SLA **[open OQ-03]** |
| Contract | Agreement with a client | Relationship Client↔Service↔Contract undefined **[open OQ-03]** |
| ChargeItem | Chargeable item | Billing is future scope; MVP purpose **[open OQ-04]** |

### Work
| Entity | Role in the model | Notes |
|---|---|---|
| WorkItem | Shared base of Activities and Tickets (interpretation — supported by conversion rule and CLAUDE.md "Activities and Tickets share common behavior") | Inheritance strategy is a key technical decision |
| Activity | Unit of work; may exist without client or date | Can be converted into a Ticket preserving history |
| Ticket | Helpdesk unit of work | Never belongs to a Project; SLA applies |
| Project | Container of work | Contains **Lists > Activities > Subactivities** |
| TimeEntry | Time logged against work | Manual entry only in MVP |
| RecurrenceTemplate | Template that generates recurring work | What it generates (Activities? Tickets?) **[open OQ-05]** |

### Communication
| Entity | Role in the model | Notes |
|---|---|---|
| Conversation | Thread of messages | Must be channel-agnostic (WhatsApp is future) |
| Message | Single message in a conversation | MVP = Manual Messaging only |

### Platform
| Entity | Role in the model | Notes |
|---|---|---|
| Report | Generated/saved report | Entity vs. dynamic query **[open OQ-06]** |
| AuditLog | Immutable record of important changes | Cross-cutting; scope of "important" **[open OQ-07]** |

## 3. Business Rules → Model Implications (PRD §6)

| # | Rule (verbatim) | Model implication |
|---|---|---|
| R1 | Activities may exist without client or date | `Activity.clientId` and `Activity.dueDate` nullable |
| R2 | Activities can be converted into Tickets preserving history | Conversion must keep the same underlying identity or a durable link; audit trail and time entries must survive conversion. Strong argument for a shared `WorkItem` base |
| R3 | Tickets never belong to Projects | No `Ticket → Project` relation; enforce at schema and application level |
| R4 | Projects contain Lists > Activities > Subactivities | `List` is required by this rule but **is not in the entity list** (inconsistency I-01). "Subactivity" is presumably a self-referencing Activity (interpretation — confirm, OQ-08) |
| R5 | Manual time entry only in MVP | No timers, no automatic tracking; `TimeEntry` created by users |
| R6 | No permissions by client | Authorization is role-based only; no per-client row scoping in MVP |
| R7 | Only SuperAdmin changes SLA definitions | SLA definitions are configuration-level data with role-gated writes; where SLA lives is **[open OQ-03]** |

## 4. Tentative Relationship Sketch (interpretation — confirm)

```
Organization 1─* User
Organization 1─* Team          Team *─* User (membership — confirm)
Organization 1─* Client 1─* Contact
Client *─* Service (via Contract? — OQ-03)
Client 1─* Contract

WorkItem (base) ◄── Activity
                ◄── Ticket
Activity *─1 Client (nullable, R1)
Activity *─1 List (nullable — standalone activities exist outside projects, R1/R4)
Activity 1─* Activity (subactivities — OQ-08)
Project 1─* List 1─* Activity
Ticket *─1 Client (assumed required for SLA — confirm, OQ-09)

WorkItem 1─* TimeEntry *─1 User
RecurrenceTemplate 1─* (generated work items — OQ-05)

Client 1─* Conversation 1─* Message (channel field on Message/Conversation)
AuditLog *─1 (any audited entity, polymorphic reference)
```

## 5. Detected Inconsistencies

| ID | Inconsistency | Where |
|---|---|---|
| I-01 | `List` is required by rule R4 (Projects contain Lists) but is missing from the entity list in §5 | PRD §5 vs §6 |
| I-02 | `Knowledge` appears as a core module (§4) but is absent from MVP scope (§9), experiences (§8) and entities (§5) | PRD §4 vs §8/§9 |
| I-03 | `Client` is a role (§7) but "no permissions by client" (§6) and Customer Portal is future scope (§10) — what a Client-role user can access in MVP is undefined and possibly contradictory | PRD §6/§7/§10 |
| I-04 | `Manual Messaging` is in MVP scope (§9) and `Conversation`/`Message` are entities (§5), but no Messaging module exists in §4 and the vision calls messaging "future" | PRD §4 vs §9 |
| I-05 | `ChargeItem` is a current entity (§5) while Billing is future scope (§10) | PRD §5 vs §10 |
| I-06 | SLA is measured (§2) and governed (§6) but has no entity and no defined attachment point | PRD §2/§6 vs §5 |

All of these are registered with proposed resolutions in `docs/decisions/open-questions.md`.
