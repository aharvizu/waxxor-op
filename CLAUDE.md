# Watson - Project Instructions

## Project

Watson is an Operations OS for technology service companies.

It centralizes:

- Activities
- Helpdesk Tickets
- Projects
- Clients
- Services
- Contracts
- Time Tracking
- Reports
- Operational KPIs

This repository is the official implementation of Watson.

## Source of Truth

The product definition lives under:

docs/prd/

Never invent business rules.

If requirements are unclear, ask before implementing.

## Development Principles

- Build one feature at a time.
- Never refactor unrelated code.
- Prefer reusable components.
- Follow the existing architecture.
- Use strict TypeScript.
- Avoid duplicated business logic.
- Activities and Tickets share common behavior whenever possible.
- Projects never contain Tickets directly.
- Everything important must be auditable.
- Keep the UI clean, modern and fast.

## Workflow

Before writing code:

1. Understand the requirement.
2. Explain the implementation plan.
3. Identify affected files.
4. Only ask questions if a business rule is missing.

After coding:

- Run lint.
- Run type checking.
- Run tests when applicable.
- Summarize the changes.

## UI

Use modern SaaS UX.

Primary inspiration:

- Untitled UI
- Linear
- ClickUp
- Notion

Avoid old enterprise UI patterns.

## Philosophy

Nothing should be forgotten.

Watson exists to improve operational execution.
