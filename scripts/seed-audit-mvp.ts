import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * MVP functional-audit demo data (2026-07-20). Realistic, richly related test
 * data across every module so the full commercial-demo walkthrough can be
 * exercised end to end. Reuses real business logic (createWorkItem,
 * generateReport, runDueRecurrences, SLA snapshotting) wherever it exists as
 * a pure lib function, instead of hand-crafting rows — so audit logs, folios
 * and SLA math are all the real thing, not seed-only shortcuts.
 *
 * Idempotent-ish: re-running adds a fresh batch (companies/contacts get a
 * timestamp suffix in a hidden tag) rather than upserting — this is throwaway
 * demo data, not a fixture other tests depend on.
 */

async function main() {
  const { eq, and, sql } = await import("drizzle-orm");
  const bcrypt = (await import("bcryptjs")).default;
  const { db } = await import("../src/db");
  const schema = await import("../src/db/schema");
  const {
    organizations,
    users,
    companies,
    contacts,
    companyContacts,
    services,
    clientServices,
    contracts,
    clientNotes,
    tickets,
    activities,
    timeEntries,
    projects,
    projectLists,
    projectMilestones,
    projectRisks,
    slaDefinitions,
    catalogItems,
    knowledgeCategories,
    knowledgeArticles,
    knowledgeArticleRelations,
    reports,
    reportTemplates,
    recurrenceDefinitions,
    indicatorThresholds,
  } = schema;

  const { createWorkItem, updateWorkItemFields } = await import("../src/lib/work-items");
  const { resolveSlaDefinition, buildSlaSnapshot, getOrgCalendar } = await import("../src/lib/sla");
  const { generateReport } = await import("../src/lib/report-generation");
  const { runDueRecurrences } = await import("../src/lib/recurrence-engine");
  const { recordAudit } = await import("../src/lib/audit");
  const { slugify } = await import("../src/lib/knowledge");

  const rand = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const isoDaysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const isoDaysFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // ---------------------------------------------------------------- org
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "watson"));
  if (!org) throw new Error("Watson org not seeded — run `npm run db:seed` first.");
  const orgId = org.id;

  const [admin] = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, orgId), eq(users.role, "superadmin")))
    .limit(1);
  if (!admin) throw new Error("No superadmin found in the watson org.");
  const adminSession = { id: String(admin.id), organizationId: orgId, role: "superadmin" as const };

  // -------------------------------------------------------------- users
  console.log("Creating internal users…");
  const newUsers = [
    { name: "Laura Méndez", email: "laura.mendez@watson-demo.mx", role: "administrator" as const, title: "Gerente de Operaciones" },
    { name: "Ricardo Solís", email: "ricardo.solis@watson-demo.mx", role: "director" as const, title: "Director de Servicios" },
    { name: "Paola Nuñez", email: "paola.nunez@watson-demo.mx", role: "project_manager" as const, title: "Project Manager" },
    { name: "Diego Castillo", email: "diego.castillo@watson-demo.mx", role: "project_manager" as const, title: "Project Manager" },
    { name: "Ana Ibarra", email: "ana.ibarra@watson-demo.mx", role: "technician" as const, title: "Técnico Senior" },
    { name: "Carlos Ríos", email: "carlos.rios@watson-demo.mx", role: "technician" as const, title: "Técnico" },
    { name: "Sofía Herrera", email: "sofia.herrera@watson-demo.mx", role: "technician" as const, title: "Técnico" },
  ];
  const passwordHash = await bcrypt.hash("Demo12345!", 10);
  const internalUsers: (typeof users.$inferSelect)[] = [admin];
  for (const u of newUsers) {
    const [existing] = await db.select().from(users).where(eq(users.email, u.email));
    if (existing) {
      internalUsers.push(existing);
      continue;
    }
    const [created] = await db
      .insert(users)
      .values({ ...u, organizationId: orgId, passwordHash, isActive: true })
      .returning();
    internalUsers.push(created);
  }
  const technicians = internalUsers.filter((u) => u.role === "technician" || u.role === "administrator");
  const pms = internalUsers.filter((u) => u.role === "project_manager");
  console.log(`  ${internalUsers.length} internal users total.`);

  // ------------------------------------------------------------- SLA + catalogs
  console.log("Creating SLA definitions and catalogs…");
  const slaSpecs = [
    { name: "Crítico 1h/4h", priority: "critical" as const, firstResponseMinutes: 60, resolutionMinutes: 240, isDefault: true },
    { name: "Alto 2h/8h", priority: "high" as const, firstResponseMinutes: 120, resolutionMinutes: 480, isDefault: true },
    { name: "Medio 4h/24h", priority: "medium" as const, firstResponseMinutes: 240, resolutionMinutes: 1440, isDefault: true },
    { name: "Bajo 8h/72h", priority: "low" as const, firstResponseMinutes: 480, resolutionMinutes: 4320, isDefault: true },
  ];
  const slaByPriority: Record<string, typeof slaDefinitions.$inferSelect> = {};
  for (const spec of slaSpecs) {
    const [existing] = await db
      .select()
      .from(slaDefinitions)
      .where(and(eq(slaDefinitions.organizationId, orgId), eq(slaDefinitions.name, spec.name)));
    const row =
      existing ??
      (
        await db
          .insert(slaDefinitions)
          .values({ ...spec, organizationId: orgId, businessHoursOnly: true, status: "active" })
          .returning()
      )[0];
    slaByPriority[spec.priority] = row;
  }

  const catalogSpecs: { kind: string; name: string }[] = [
    { kind: "ticket_category", name: "Redes" },
    { kind: "ticket_category", name: "Servidores" },
    { kind: "ticket_category", name: "Software" },
    { kind: "ticket_category", name: "Seguridad" },
    { kind: "ticket_category", name: "Hardware" },
    { kind: "ticket_category", name: "Accesos" },
    { kind: "activity_tag", name: "Mantenimiento" },
    { kind: "activity_tag", name: "Onboarding" },
    { kind: "activity_tag", name: "Auditoría" },
    { kind: "activity_tag", name: "Capacitación" },
    { kind: "activity_tag", name: "Comercial" },
    { kind: "company_category", name: "Cuenta estratégica" },
    { kind: "company_category", name: "Cuenta estándar" },
    { kind: "company_category", name: "Cuenta nueva" },
    { kind: "company_category", name: "Cuenta en riesgo" },
    { kind: "company_tag", name: "VIP" },
    { kind: "company_tag", name: "Multisede" },
    { kind: "company_tag", name: "Contrato anual" },
    { kind: "company_tag", name: "Facturación especial" },
  ];
  for (const c of catalogSpecs) {
    const [existing] = await db
      .select()
      .from(catalogItems)
      .where(and(eq(catalogItems.organizationId, orgId), eq(catalogItems.kind, c.kind), eq(catalogItems.name, c.name)));
    if (!existing) {
      await db.insert(catalogItems).values({ organizationId: orgId, kind: c.kind, name: c.name, createdById: admin.id });
    }
  }
  const ticketCategories = (
    await db
      .select({ name: catalogItems.name })
      .from(catalogItems)
      .where(and(eq(catalogItems.organizationId, orgId), eq(catalogItems.kind, "ticket_category")))
  ).map((r) => r.name);

  // ------------------------------------------------------------- services
  console.log("Creating service catalog…");
  const serviceSpecs = [
    { name: "Microsoft 365", category: "licensing" },
    { name: "Backup gestionado", category: "managed_service" },
    { name: "Soporte técnico", category: "support" },
    { name: "Firewall administrado", category: "security" },
    { name: "Monitoreo de infraestructura", category: "managed_service" },
    { name: "Consultoría de redes", category: "consulting" },
  ];
  const serviceRows: (typeof services.$inferSelect)[] = [];
  for (const s of serviceSpecs) {
    const [existing] = await db.select().from(services).where(and(eq(services.organizationId, orgId), eq(services.name, s.name)));
    serviceRows.push(
      existing ??
        (
          await db
            .insert(services)
            .values({ ...s, organizationId: orgId, isRenewable: true, status: "active" })
            .returning()
        )[0],
    );
  }

  // ------------------------------------------------------------ companies
  console.log("Creating 25 companies…");
  const INDUSTRIES = ["Manufactura", "Automotriz", "Salud", "Agroindustria", "Retail", "Gobierno", "Tecnología"] as const;
  const companyNamesByIndustry: Record<(typeof INDUSTRIES)[number], string[]> = {
    Manufactura: ["Industrias Cardón", "Manufacturas del Bajío", "Grupo Ensamblex", "Aceros Monterrey"],
    Automotriz: ["AutoPartes del Norte", "Grupo Motriz Silao", "Componentes Querétaro", "Transmisiones Aguascalientes"],
    Salud: ["Hospital Santa Fe", "Grupo Médico Provita", "Laboratorios Clínicos Aurora", "Farmacéutica Nortemed"],
    Agroindustria: ["Agroindustrias del Pacífico", "Grupo Citrícola Veracruz", "Empacadora Sinaloa", "Lácteos La Huerta"],
    Retail: ["Tiendas Colibrí", "Grupo Comercial Estrella", "Cadena Moderna Retail", "Distribuidora Zafiro"],
    Gobierno: ["Municipio de Reforma", "Instituto Estatal de Catastro", "Secretaría de Movilidad Regional"],
    Tecnología: ["Nova Software Labs", "DataForte Systems", "CloudPeak México", "Integradora Digital Aztec"],
  };
  const companyStatuses = ["active", "active", "active", "active", "inactive", "prospect_legacy"] as const;
  const companyTagSets = [["VIP"], ["Multisede"], ["Contrato anual"], ["Facturación especial"], []];

  const companyRows: (typeof companies.$inferSelect)[] = [];
  let idx = 0;
  for (const industry of INDUSTRIES) {
    for (const name of companyNamesByIndustry[industry]) {
      idx++;
      const [existing] = await db.select().from(companies).where(and(eq(companies.organizationId, orgId), eq(companies.name, name)));
      if (existing) {
        companyRows.push(existing);
        continue;
      }
      const [row] = await db
        .insert(companies)
        .values({
          organizationId: orgId,
          name,
          legalName: `${name} S.A. de C.V.`,
          taxId: `AUD${String(idx).padStart(6, "0")}XXX`,
          industry,
          website: `https://www.${slugify(name)}.mx`,
          email: `contacto@${slugify(name)}.mx`,
          phone: `+52 55 5${randInt(100, 999)} ${randInt(1000, 9999)}`,
          address: `Av. Industria ${randInt(100, 999)}`,
          city: rand(["CDMX", "Monterrey", "Guadalajara", "Querétaro", "Puebla", "León"]),
          state: rand(["CDMX", "Nuevo León", "Jalisco", "Querétaro", "Puebla", "Guanajuato"]),
          country: "México",
          status: rand(companyStatuses),
          tags: rand(companyTagSets),
          accountOwnerId: rand(internalUsers.filter((u) => u.role !== "technician")).id,
          defaultTechnicianId: rand(technicians).id,
          notes: `Cuenta de auditoría funcional (${industry}).`,
        })
        .returning();
      companyRows.push(row);
    }
  }
  // Pad to exactly 25 with a couple of extra generic accounts if the fixed list came up short.
  while (companyRows.length < 25) {
    const industry = rand(INDUSTRIES);
    const name = `${industry} Solutions ${companyRows.length + 1}`;
    const [row] = await db
      .insert(companies)
      .values({ organizationId: orgId, name, industry, status: "active", accountOwnerId: admin.id })
      .returning();
    companyRows.push(row);
  }
  console.log(`  ${companyRows.length} companies.`);

  // ------------------------------------------------------------- contacts
  console.log("Creating 80 contacts…");
  const JOB_TITLES: { title: string; contactType: (typeof contacts.$inferInsert)["contactType"] }[] = [
    { title: "Director General", contactType: "owner" },
    { title: "Director TI", contactType: "technical" },
    { title: "Compras", contactType: "administrative" },
    { title: "Finanzas", contactType: "billing" },
    { title: "RH", contactType: "management" },
    { title: "Operaciones", contactType: "requester" },
    { title: "Usuario Final", contactType: "other" },
  ];
  const firstNames = ["María", "José", "Luis", "Fernanda", "Alejandro", "Daniela", "Jorge", "Valeria", "Miguel", "Camila", "Roberto", "Isabel", "Andrés", "Paulina", "Héctor", "Renata"];
  const lastNames = ["García", "Hernández", "López", "Martínez", "Rodríguez", "Sánchez", "Torres", "Flores", "Vázquez", "Ramírez", "Ortiz", "Cruz", "Reyes", "Morales", "Gómez"];

  const contactRows: (typeof contacts.$inferSelect)[] = [];
  let contactsCreated = 0;
  let ci = 0;
  while (contactsCreated < 80) {
    const company = companyRows[ci % companyRows.length];
    const jt = JOB_TITLES[contactsCreated % JOB_TITLES.length];
    const firstName = rand(firstNames);
    const lastName = rand(lastNames);
    const isPrimary = jt.title === "Director General" && !contactRows.some((c) => c.companyId === company.id && c.isPrimary);
    const [row] = await db
      .insert(contacts)
      .values({
        organizationId: orgId,
        companyId: company.id,
        firstName,
        lastName,
        jobTitle: jt.title,
        department: rand(["Dirección", "TI", "Compras", "Finanzas", "RH", "Operaciones", "Soporte"]),
        email: `${slugify(firstName)}.${slugify(lastName)}@${slugify(company.name)}.mx`,
        phone: `+52 55 5${randInt(100, 999)} ${randInt(1000, 9999)}`,
        mobile: `+52 1 55 5${randInt(100, 999)} ${randInt(1000, 9999)}`,
        contactType: jt.contactType,
        isPrimary,
        isActive: Math.random() > 0.08,
        notes: contactsCreated % 10 === 0 ? "Contacto de auditoría funcional." : null,
      })
      .returning();
    contactRows.push(row);
    if (isPrimary) {
      await db.update(companies).set({ primaryContactId: row.id }).where(eq(companies.id, company.id));
    }
    await db.insert(companyContacts).values({ companyId: company.id, contactId: row.id, isPrimary });
    contactsCreated++;
    ci++;
  }
  console.log(`  ${contactRows.length} contacts.`);

  const activeCompanies = companyRows.filter((c) => c.status === "active");
  const contactsByCompany = (companyId: number) => contactRows.filter((c) => c.companyId === companyId && c.isActive);

  // ------------------------------------------------------ services/contracts/notes
  console.log("Creating client services, contracts and notes…");
  for (const company of activeCompanies.slice(0, 20)) {
    const n = randInt(1, 2);
    for (let i = 0; i < n; i++) {
      const service = rand(serviceRows);
      await db.insert(clientServices).values({
        organizationId: orgId,
        companyId: company.id,
        serviceId: service.id,
        serviceType: rand(["recurring_service", "license", "support_contract"] as const),
        status: "active",
        provider: "Watson",
        billingCycle: "monthly",
        cost: String(randInt(500, 5000)),
        clientPrice: String(randInt(800, 8000)),
        startDate: isoDaysAgo(randInt(30, 400)),
        renewalDate: isoDaysFromNow(randInt(-10, 90)),
        supportCoverage: "included",
        includedHours: randInt(5, 40),
        slaDefinitionId: slaByPriority.medium.id,
      });
    }
  }
  for (const company of activeCompanies.slice(0, 10)) {
    await db.insert(contracts).values({
      organizationId: orgId,
      companyId: company.id,
      name: `Contrato de soporte anual — ${company.name}`,
      contractType: "support",
      status: "active",
      startDate: isoDaysAgo(randInt(30, 200)),
      endDate: isoDaysFromNow(randInt(30, 300)),
      autoRenew: true,
      includedHours: randInt(20, 80),
      monthlyAmount: String(randInt(5000, 40000)),
    });
  }
  for (const company of companyRows.slice(0, 15)) {
    await db.insert(clientNotes).values({
      organizationId: orgId,
      companyId: company.id,
      authorId: rand(internalUsers).id,
      body: "Nota de seguimiento generada para la auditoría funcional del MVP.",
    });
  }

  // ----------------------------------------------------------------- projects
  console.log("Creating projects…");
  const projectRows: (typeof projects.$inferSelect)[] = [];
  const projectCompanies = [...activeCompanies.slice(0, 10), null, null];
  let pi = 0;
  for (const company of projectCompanies) {
    pi++;
    const [row] = await db
      .insert(projects)
      .values({
        organizationId: orgId,
        folio: sql`'PRJ-' || lpad(nextval('project_folio_seq')::text, 6, '0')`,
        name: company ? `Implementación ${rand(serviceRows).name} — ${company.name}` : `Proyecto interno ${pi}`,
        description: "Proyecto de auditoría funcional con datos reales.",
        companyId: company?.id ?? null,
        status: rand(["planning", "active", "active", "on_hold", "completed"] as const),
        priority: rand(["low", "normal", "high", "urgent"] as const),
        healthStatus: rand(["on_track", "attention", "at_risk", "not_set"] as const),
        projectManagerId: rand(pms).id,
        ownerId: admin.id,
        startDate: isoDaysAgo(randInt(10, 120)),
        targetDate: isoDaysFromNow(randInt(10, 90)),
        createdById: admin.id,
      })
      .returning();
    projectRows.push(row);

    const [list] = await db
      .insert(projectLists)
      .values({ organizationId: orgId, projectId: row.id, name: "Backlog", position: 0 })
      .returning();
    await db.insert(projectLists).values({ organizationId: orgId, projectId: row.id, name: "En progreso", position: 1 });

    await db.insert(projectMilestones).values({
      organizationId: orgId,
      projectId: row.id,
      name: "Kickoff completado",
      targetDate: isoDaysAgo(randInt(1, 30)),
      status: rand(["pending", "in_progress", "completed"] as const),
      ownerId: rand(pms).id,
    });

    if (pi % 2 === 0) {
      await db.insert(projectRisks).values({
        organizationId: orgId,
        projectId: row.id,
        title: "Dependencia de proveedor externo",
        probability: rand(["low", "medium", "high"] as const),
        impact: rand(["medium", "high", "critical"] as const),
        status: "open",
        ownerId: rand(pms).id,
        createdById: admin.id,
      });
    }

    // 2-3 project activities per project, via real createWorkItem.
    const n = randInt(2, 3);
    for (let i = 0; i < n; i++) {
      await db.transaction(async (tx) => {
        const item = await createWorkItem(tx, adminSession, {
          type: "project_activity",
          title: `${rand(["Configurar", "Documentar", "Validar", "Desplegar"])} ${rand(["ambiente", "políticas", "accesos", "reportes"])}`,
          priority: rand(["low", "medium", "high"] as const),
          companyId: company?.id ?? null,
          assigneeId: rand(technicians).id,
          dueDate: isoDaysFromNow(randInt(-5, 30)),
        });
        await tx.insert(activities).values({
          organizationId: orgId,
          workItemId: item.id,
          activityType: "implementation",
          projectId: row.id,
          projectListId: list.id,
        });
      });
    }
  }
  console.log(`  ${projectRows.length} projects.`);

  // ----------------------------------------------------------------- tickets
  console.log("Creating 50 tickets…");
  const calendar = await getOrgCalendar(db, orgId);
  const ticketStatusFlow = ["new", "assigned", "in_progress", "resolved", "closed", "reopened"] as const;
  const ticketWorkItems: { workItemId: number; ticketId: number; companyId: number | null }[] = [];
  for (let i = 0; i < 50; i++) {
    const company = rand(activeCompanies);
    const companyContactsList = contactsByCompany(company.id);
    const contact = companyContactsList.length > 0 ? rand(companyContactsList) : null;
    const priority = rand(["low", "medium", "high", "critical"] as const);
    const status = rand(ticketStatusFlow);
    const assignee = rand(technicians);

    const result = await db.transaction(async (tx) => {
      const item = await createWorkItem(tx, adminSession, {
        type: "ticket",
        title: `${rand(["No enciende", "Falla intermitente", "Solicitud de acceso", "Error al iniciar sesión", "Lentitud en el sistema", "Configuración de correo", "Falla de red", "Actualización requerida"])} — ${company.name}`,
        description: "Ticket generado para la auditoría funcional del MVP.",
        status: status === "new" ? "new" : status,
        priority,
        companyId: company.id,
        contactId: contact?.id ?? null,
        assigneeId: assignee.id,
      });
      const definition = await resolveSlaDefinition(tx, orgId, priority, null);
      const snapshot = definition ? buildSlaSnapshot(definition, calendar, new Date()) : {};
      const [ticket] = await tx
        .insert(tickets)
        .values({
          organizationId: orgId,
          workItemId: item.id,
          folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
          category: rand(ticketCategories.length > 0 ? ticketCategories : ["General"]),
          channel: rand(["email", "phone", "whatsapp", "portal"]),
          modality: rand(["remote", "onsite"]),
          contact: contact ? `${contact.firstName} ${contact.lastName}` : null,
          ...snapshot,
        })
        .returning({ id: tickets.id, folio: tickets.folio });
      await recordAudit(tx, {
        organizationId: orgId,
        userId: admin.id,
        entityType: "ticket",
        entityId: ticket.id,
        action: "create",
        metadata: { workItemId: item.id, folio: ticket.folio },
      });
      return { workItemId: item.id, ticketId: ticket.id };
    });
    ticketWorkItems.push({ ...result, companyId: company.id });
  }

  // Progress a subset through the real lifecycle so the demo has closed/resolved tickets and billing states.
  for (const { workItemId, ticketId } of ticketWorkItems.slice(0, 30)) {
    await db.transaction(async (tx) => {
      await updateWorkItemFields(tx, adminSession, workItemId, { status: "resolved", completedAt: new Date() });
      await tx
        .update(tickets)
        .set({
          resolution: "Resuelto durante la auditoría funcional — solución verificada con el usuario.",
          resolvedAt: new Date(),
          billingStatus: rand(["billable", "included_in_contract", "no_charge"] as const),
        })
        .where(eq(tickets.id, ticketId));
    });
  }
  for (const { workItemId, ticketId } of ticketWorkItems.slice(0, 20)) {
    await db.transaction(async (tx) => {
      await updateWorkItemFields(tx, adminSession, workItemId, { status: "closed" });
      await tx.update(tickets).set({ closedAt: new Date() }).where(eq(tickets.id, ticketId));
    });
  }
  console.log(`  ${ticketWorkItems.length} tickets created; 30 resolved, 20 closed.`);

  // -------------------------------------------------------------- activities
  console.log("Creating 35 standalone activities…");
  const activityWorkItems: number[] = [];
  for (let i = 0; i < 35; i++) {
    const company = Math.random() > 0.2 ? rand(activeCompanies) : null;
    const completed = Math.random() > 0.4;
    const item = await db.transaction(async (tx) => {
      const created = await createWorkItem(tx, adminSession, {
        type: "activity",
        title: `${rand(["Revisión mensual", "Visita preventiva", "Actualización de inventario", "Capacitación de usuario", "Levantamiento de requerimientos", "Auditoría de seguridad"])}${company ? ` — ${company.name}` : ""}`,
        priority: rand(["low", "medium", "high"] as const),
        status: completed ? "completed" : rand(["pending", "in_progress", "waiting"] as const),
        companyId: company?.id ?? null,
        assigneeId: rand(technicians).id,
        dueDate: isoDaysFromNow(randInt(-10, 30)),
      });
      await tx.insert(activities).values({
        organizationId: orgId,
        workItemId: created.id,
        activityType: rand(["general", "follow_up", "meeting", "preventive", "training", "administrative"] as const),
      });
      if (completed) {
        await updateWorkItemFields(tx, adminSession, created.id, { completedAt: new Date() });
      }
      return created;
    });
    activityWorkItems.push(item.id);
  }
  console.log(`  ${activityWorkItems.length} activities.`);

  // ------------------------------------------------------------ time entries
  console.log("Creating time entries…");
  const allWorkItemIds = [...ticketWorkItems.map((t) => t.workItemId), ...activityWorkItems];
  let timeEntryCount = 0;
  for (const workItemId of allWorkItemIds) {
    if (Math.random() > 0.6) continue; // not every item has logged time
    const n = randInt(1, 2);
    for (let i = 0; i < n; i++) {
      await db.insert(timeEntries).values({
        organizationId: orgId,
        workItemId,
        userId: rand(technicians).id,
        date: isoDaysAgo(randInt(0, 45)),
        durationMinutes: randInt(15, 240),
        timeType: rand(["technical_work", "remote_support", "onsite_support", "research", "documentation"] as const),
        billingStatus: rand(["billable", "non_billable", "included_in_contract", "pending_review"] as const),
        modality: rand(["remote", "onsite"] as const),
        description: "Registro de tiempo — auditoría funcional.",
        createdById: admin.id,
      });
      timeEntryCount++;
    }
  }
  console.log(`  ${timeEntryCount} time entries.`);

  // -------------------------------------------------------------- knowledge
  console.log("Creating knowledge base categories and articles…");
  const kbCategorySpecs = ["Redes y conectividad", "Cuentas y accesos", "Software y licenciamiento", "Hardware"];
  const kbCategories: (typeof knowledgeCategories.$inferSelect)[] = [];
  for (const name of kbCategorySpecs) {
    const [existing] = await db
      .select()
      .from(knowledgeCategories)
      .where(and(eq(knowledgeCategories.organizationId, orgId), eq(knowledgeCategories.slug, slugify(name))));
    kbCategories.push(
      existing ??
        (
          await db
            .insert(knowledgeCategories)
            .values({ organizationId: orgId, name, slug: slugify(name), createdById: admin.id })
            .returning()
        )[0],
    );
  }
  const kbStatuses = ["draft", "in_review", "published", "published", "published", "archived"] as const;
  const kbArticles: (typeof knowledgeArticles.$inferSelect)[] = [];
  for (let i = 0; i < 12; i++) {
    const title = `${rand(["Cómo restablecer", "Guía para configurar", "Solución a", "Procedimiento de"])} ${rand(["accesos VPN", "correo corporativo", "impresoras de red", "políticas de contraseña", "respaldo de archivos", "conexión WiFi"])}`;
    const status = kbStatuses[i % kbStatuses.length];
    const [article] = await db
      .insert(knowledgeArticles)
      .values({
        organizationId: orgId,
        categoryId: rand(kbCategories).id,
        title,
        slug: `${slugify(title)}-${i}`,
        status,
        visibility: "internal",
        tags: [rand(["redes", "accesos", "software", "hardware"])],
        problem: "Descripción del problema recurrente reportado por usuarios.",
        cause: "Causa raíz identificada durante la resolución de tickets.",
        solution: "Pasos de solución documentados y verificados.",
        steps: ["Identificar el síntoma", "Verificar configuración", "Aplicar la corrección", "Confirmar con el usuario"],
        authorId: rand(technicians).id,
        reviewerId: status !== "draft" ? admin.id : null,
        publishedAt: status === "published" || status === "archived" ? new Date() : null,
        archivedAt: status === "archived" ? new Date() : null,
      })
      .returning();
    kbArticles.push(article);
  }
  // Relate a handful of articles to real tickets/companies for cross-navigation.
  for (let i = 0; i < 8; i++) {
    const article = kbArticles[i % kbArticles.length];
    const ticket = ticketWorkItems[i % ticketWorkItems.length];
    await db.insert(knowledgeArticleRelations).values({
      articleId: article.id,
      relatedType: "ticket",
      relatedId: ticket.ticketId,
      isOrigin: i === 0,
      createdById: admin.id,
    });
    if (ticket.companyId) {
      await db.insert(knowledgeArticleRelations).values({
        articleId: article.id,
        relatedType: "company",
        relatedId: ticket.companyId,
        createdById: admin.id,
      });
    }
  }
  console.log(`  ${kbArticles.length} KB articles.`);

  // ---------------------------------------------------------------- reports
  console.log("Creating reports (real metrics via generateReport)…");
  const [template] = await db.select().from(reportTemplates).where(eq(reportTemplates.organizationId, orgId)).limit(1);
  const reportRows: (typeof reports.$inferSelect)[] = [];
  for (let i = 0; i < 10; i++) {
    const company = rand(activeCompanies);
    const periodStart = isoDaysAgo(60);
    const periodEnd = isoDaysAgo(1);
    const [report] = await db
      .insert(reports)
      .values({
        organizationId: orgId,
        title: `Reporte mensual — ${company.name}`,
        status: "draft",
        templateId: template?.id ?? null,
        companyId: company.id,
        reportType: "monthly_service",
        periodStart,
        periodEnd,
        responsibleUserId: rand(internalUsers).id,
        createdById: admin.id,
      })
      .returning();
    try {
      await generateReport(orgId, report.id, admin.id);
    } catch (err) {
      console.log(`   (generateReport skipped for report ${report.id}: ${(err as Error).message})`);
    }
    reportRows.push(report);
  }
  // Approve/send a subset for status diversity.
  for (const report of reportRows.slice(0, 4)) {
    await db.update(reports).set({ status: "approved", approvedByUserId: admin.id, approvedAt: new Date() }).where(eq(reports.id, report.id));
  }
  for (const report of reportRows.slice(0, 2)) {
    await db.update(reports).set({ status: "sent", sentByUserId: admin.id, sentAt: new Date() }).where(eq(reports.id, report.id));
  }
  console.log(`  ${reportRows.length} reports.`);

  // ----------------------------------------------------------- recurrences
  console.log("Creating and executing recurrence definitions…");
  const recCompany = activeCompanies[0];
  const recProject = projectRows.find((p) => p.companyId !== null) ?? projectRows[0];
  const [recProjectList] = await db.select().from(projectLists).where(eq(projectLists.projectId, recProject.id)).limit(1);

  const recurrenceSpecs = [
    {
      name: "Revisión preventiva mensual",
      targetType: "activity" as const,
      frequency: "monthly" as const,
      templateData: {
        targetType: "activity",
        title: "Revisión preventiva mensual",
        activityType: "preventive",
        priority: "medium",
        dueOffsetDays: 5,
      },
      companyId: recCompany.id,
    },
    {
      name: "Ticket de mantenimiento programado",
      targetType: "ticket" as const,
      frequency: "weekly" as const,
      templateData: {
        targetType: "ticket",
        title: "Mantenimiento programado de infraestructura",
        priority: "low",
        category: ticketCategories[0] ?? "General",
        channel: "internal",
        modality: "remote",
        dueOffsetDays: 2,
      },
      companyId: recCompany.id,
    },
    {
      name: "Actividad de proyecto recurrente",
      targetType: "project_activity" as const,
      frequency: "weekly" as const,
      templateData: {
        targetType: "project_activity",
        title: "Seguimiento semanal de avance",
        activityType: "review",
        priority: "medium",
        dueOffsetDays: 1,
      },
      companyId: recProject.companyId,
      projectId: recProject.id,
      projectListId: recProjectList?.id ?? null,
    },
    {
      name: "Reporte mensual automático",
      targetType: "report" as const,
      frequency: "monthly" as const,
      templateData: {
        targetType: "report",
        title: "Reporte mensual automático",
        templateId: template?.id ?? null,
        periodRule: "previous_month",
        dueOffsetDays: 3,
      },
      companyId: recCompany.id,
    },
  ];

  for (const spec of recurrenceSpecs) {
    const [existing] = await db
      .select()
      .from(recurrenceDefinitions)
      .where(and(eq(recurrenceDefinitions.organizationId, orgId), eq(recurrenceDefinitions.name, spec.name)));
    if (existing) continue;
    await db.insert(recurrenceDefinitions).values({
      organizationId: orgId,
      name: spec.name,
      description: "Recurrencia de auditoría funcional.",
      targetType: spec.targetType,
      status: "active",
      isActive: true,
      scheduleType: "calendar",
      frequency: spec.frequency,
      interval: 1,
      timeOfDay: "09:00",
      startAt: isoDaysAgo(30),
      nextRunAt: new Date(Date.now() - 60_000), // due now
      companyId: spec.companyId ?? null,
      projectId: (spec as { projectId?: number }).projectId ?? null,
      projectListId: (spec as { projectListId?: number | null }).projectListId ?? null,
      assigneeId: rand(technicians).id,
      createdById: admin.id,
      templateData: spec.templateData,
    });
  }

  const batch = await runDueRecurrences(20);
  console.log(`  Recurrences executed: ${batch.processed} processed, ${batch.succeeded} succeeded, ${batch.failed} failed.`);

  // ---------------------------------------------------------- indicators
  console.log("Setting one indicator threshold override…");
  const [existingThreshold] = await db
    .select()
    .from(indicatorThresholds)
    .where(and(eq(indicatorThresholds.organizationId, orgId), eq(indicatorThresholds.key, "sla_at_risk_pct")));
  if (!existingThreshold) {
    await db
      .insert(indicatorThresholds)
      .values({ organizationId: orgId, key: "sla_at_risk_pct", value: "25", updatedById: admin.id })
      .onConflictDoNothing();
  }

  console.log("\nSeed complete.");
  console.log(`Companies: ${companyRows.length}, Contacts: ${contactRows.length}, Projects: ${projectRows.length}, Tickets: ${ticketWorkItems.length}, Activities: ${activityWorkItems.length}, Time entries: ${timeEntryCount}, KB articles: ${kbArticles.length}, Reports: ${reportRows.length}, Recurrences: ${recurrenceSpecs.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
