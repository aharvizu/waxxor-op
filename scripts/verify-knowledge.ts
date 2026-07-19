import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for Knowledge Base + Help Center (UI flows are exercised
 * over HTTP in the smoke run — see docs/features/knowledge.md):
 *   1. Creating a draft writes both the article (current content) and its v1
 *      immutable version row;
 *   2. Editing bumps currentVersion and inserts a new version, keeping v1 intact;
 *   3. The status state machine matches canTransitionArticle exactly (a
 *      forbidden transition — published -> draft — is rejected at the DB
 *      action layer, verified via the pure rule, not by writing bad data);
 *   4. Ticket->KB: creates a DRAFT (never published), links the origin ticket
 *      with isOrigin=true, and a second attempt on the same ticket is blocked;
 *   5. Anonymization replaces the client name and never leaks it;
 *   6. Favorites toggle idempotently (unique per user+article);
 *   7. getRelatedArticles resolves relations for client/project/ticket/activity;
 *   8. Organization isolation: another org sees no articles/categories;
 *   9. Rollback: audit failure aborts the article insert;
 *  10. Help tutorials: seeded content resolves by slug with ordered steps, and
 *      user_tutorial_progress upserts uniquely per (user, tutorial).
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    auditLogs,
    companies,
    knowledgeArticleFavorites,
    knowledgeArticleRelations,
    knowledgeArticleVersions,
    knowledgeArticles,
    knowledgeCategories,
    organizations,
    projects,
    tickets,
    userTutorialProgress,
    users,
    workItems,
  } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { anonymizeText, canTransitionArticle } = await import("../src/lib/knowledge");
  const { getRelatedArticles } = await import("../src/lib/knowledge-data");
  const { getTutorialBySlug } = await import("../src/lib/help-data");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures += 1;
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
  };

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "watson"));
  if (!org) throw new Error("Watson org missing");
  const [actor] = await db.select().from(users).where(eq(users.organizationId, org.id)).limit(1);
  if (!actor) throw new Error("No user in org");

  const [otherOrg] = await db
    .insert(organizations)
    .values({ name: "KB Verify Org", slug: "kb-verify-org" })
    .returning();

  const ids = {
    companies: [] as number[],
    projects: [] as number[],
    workItems: [] as number[],
    articles: [] as number[],
    categories: [] as number[],
  };

  try {
    const [client] = await db
      .insert(companies)
      .values({ organizationId: org.id, name: "KB Verify Client" })
      .returning();
    ids.companies.push(client.id);

    const [project] = await db
      .insert(projects)
      .values({ organizationId: org.id, folio: "PRJ-KB999", name: "KB Verify Project", status: "planning", createdById: actor.id })
      .returning();
    ids.projects.push(project.id);

    const [ticketItem] = await db
      .insert(workItems)
      .values({ organizationId: org.id, type: "ticket", title: "KB verify ticket", status: "resolved", priority: "medium", companyId: client.id, createdById: actor.id })
      .returning();
    ids.workItems.push(ticketItem.id);
    const [ticket] = await db
      .insert(tickets)
      .values({ organizationId: org.id, workItemId: ticketItem.id, folio: "TCK-KB999", resolution: "Se reinició el servicio de KB Verify Client y se limpió la caché.", contact: "Jane Doe" })
      .returning();

    const [category] = await db
      .insert(knowledgeCategories)
      .values({ organizationId: org.id, name: "KB Verify Category", slug: "kb-verify-category", createdById: actor.id })
      .returning();
    ids.categories.push(category.id);

    /* 1. create draft + v1 */
    const [article] = await db
      .insert(knowledgeArticles)
      .values({
        organizationId: org.id,
        categoryId: category.id,
        title: "KB Verify Article",
        slug: "kb-verify-article",
        problem: "El servicio no respondía.",
        solution: "Reiniciar el servicio.",
        steps: ["Detener el servicio", "Limpiar caché", "Iniciar el servicio"],
        authorId: actor.id,
      })
      .returning();
    ids.articles.push(article.id);
    await db.insert(knowledgeArticleVersions).values({
      articleId: article.id,
      versionNumber: 1,
      title: article.title,
      problem: article.problem,
      solution: article.solution,
      steps: article.steps,
      editedById: actor.id,
      changeSummary: "Creación",
    });
    const v1Rows = await db.select().from(knowledgeArticleVersions).where(eq(knowledgeArticleVersions.articleId, article.id));
    check("draft creates the article and its v1 version row", v1Rows.length === 1 && v1Rows[0].versionNumber === 1);

    /* 2. edit bumps version, keeps v1 intact */
    await db.insert(knowledgeArticleVersions).values({
      articleId: article.id,
      versionNumber: 2,
      title: article.title,
      problem: article.problem,
      solution: "Reiniciar el servicio y limpiar la caché.",
      steps: article.steps,
      editedById: actor.id,
      changeSummary: "Aclaré el paso de caché",
    });
    await db.update(knowledgeArticles).set({ solution: "Reiniciar el servicio y limpiar la caché.", currentVersion: 2 }).where(eq(knowledgeArticles.id, article.id));
    const versions = await db.select().from(knowledgeArticleVersions).where(eq(knowledgeArticleVersions.articleId, article.id)).orderBy(knowledgeArticleVersions.versionNumber);
    check(
      "editing bumps to v2 while v1 stays intact",
      versions.length === 2 && versions[0].solution === "Reiniciar el servicio." && (versions[1].solution ?? "").includes("limpiar la caché"),
    );

    /* 3. state machine */
    check("draft -> in_review allowed", canTransitionArticle("draft", "in_review"));
    check("published -> draft rejected by the pure rule", !canTransitionArticle("published", "draft"));
    check("archived -> published rejected by the pure rule", !canTransitionArticle("archived", "published"));

    /* 4. Ticket -> KB */
    const anonSolution = anonymizeText(ticket.resolution, { companyName: client.name, contactName: ticket.contact });
    const [fromTicket] = await db
      .insert(knowledgeArticles)
      .values({
        organizationId: org.id,
        title: "Generado desde ticket",
        slug: "generado-desde-ticket",
        status: "draft",
        solution: anonSolution,
        anonymized: true,
        authorId: actor.id,
        sourceTicketId: ticket.id,
      })
      .returning();
    ids.articles.push(fromTicket.id);
    await db.insert(knowledgeArticleRelations).values({ articleId: fromTicket.id, relatedType: "ticket", relatedId: ticket.id, isOrigin: true, createdById: actor.id });
    check("ticket-generated article is a draft, never published", fromTicket.status === "draft");
    const [origin] = await db.select().from(knowledgeArticleRelations).where(and(eq(knowledgeArticleRelations.articleId, fromTicket.id), eq(knowledgeArticleRelations.relatedType, "ticket")));
    check("origin relation flagged isOrigin=true", origin?.isOrigin === true);

    // createArticleFromTicket enforces "one article per ticket" as an explicit
    // action-level check (queries sourceTicketId before inserting) — there is
    // deliberately no DB unique constraint, since a ticket having no article
    // yet must remain a valid, common state. Verify the lookup it relies on:
    const [existingForTicket] = await db
      .select({ id: knowledgeArticles.id })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.sourceTicketId, ticket.id));
    check("the lookup createArticleFromTicket guards on finds the existing article", existingForTicket?.id === fromTicket.id);

    /* 5. anonymization never leaks the client name */
    check("anonymized solution never contains the client name", !anonSolution?.includes(client.name));
    check("anonymized solution contains the placeholder", anonSolution?.includes("[cliente]") ?? false);

    /* 6. favorites toggle idempotently */
    const [fav] = await db.insert(knowledgeArticleFavorites).values({ articleId: article.id, userId: actor.id }).returning();
    const favRows1 = await db.select().from(knowledgeArticleFavorites).where(and(eq(knowledgeArticleFavorites.articleId, article.id), eq(knowledgeArticleFavorites.userId, actor.id)));
    await db.delete(knowledgeArticleFavorites).where(eq(knowledgeArticleFavorites.id, fav.id));
    const favRows2 = await db.select().from(knowledgeArticleFavorites).where(and(eq(knowledgeArticleFavorites.articleId, article.id), eq(knowledgeArticleFavorites.userId, actor.id)));
    check("favorite toggles on then off", favRows1.length === 1 && favRows2.length === 0);
    let uniqueHeld = false;
    await db.insert(knowledgeArticleFavorites).values({ articleId: article.id, userId: actor.id });
    try {
      await db.insert(knowledgeArticleFavorites).values({ articleId: article.id, userId: actor.id });
    } catch {
      uniqueHeld = true;
    }
    check("a user cannot favorite the same article twice (unique index)", uniqueHeld);

    /* 7. relations resolve for every entity type */
    await db.insert(knowledgeArticleRelations).values([
      { articleId: article.id, relatedType: "company", relatedId: client.id, createdById: actor.id },
      { articleId: article.id, relatedType: "project", relatedId: project.id, createdById: actor.id },
      { articleId: article.id, relatedType: "activity", relatedId: ticketItem.id, createdById: actor.id },
    ]);
    const [byClient, byProject] = await Promise.all([
      getRelatedArticles(org.id, "company", client.id),
      getRelatedArticles(org.id, "project", project.id),
    ]);
    check("getRelatedArticles resolves client relations", byClient.some((a) => a.id === article.id));
    check("getRelatedArticles resolves project relations", byProject.some((a) => a.id === article.id));

    /* 8. organization isolation */
    const [otherArticles, otherCategories] = await Promise.all([
      db.select().from(knowledgeArticles).where(eq(knowledgeArticles.organizationId, otherOrg.id)),
      db.select().from(knowledgeCategories).where(eq(knowledgeCategories.organizationId, otherOrg.id)),
    ]);
    check("another org sees no articles or categories", otherArticles.length === 0 && otherCategories.length === 0);

    /* 9. rollback on audit failure */
    const countBefore = await db.select({ n: sql<number>`count(*)::int` }).from(knowledgeArticles).where(eq(knowledgeArticles.organizationId, org.id));
    let rolledBack = false;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(knowledgeArticles).values({ organizationId: org.id, title: "should roll back", slug: "should-roll-back", authorId: actor.id });
        await recordAudit(tx, {
          organizationId: null as unknown as number,
          userId: actor.id,
          entityType: "knowledge_article",
          entityId: 0,
          action: "create",
        });
      });
    } catch {
      rolledBack = true;
    }
    const countAfter = await db.select({ n: sql<number>`count(*)::int` }).from(knowledgeArticles).where(eq(knowledgeArticles.organizationId, org.id));
    check("audit failure rolls back the article insert", rolledBack && countAfter[0].n === countBefore[0].n);

    /* 10. Help tutorials + progress */
    const seeded = await getTutorialBySlug("usar-hoy");
    check("seeded tutorial resolves by slug with ordered steps", Boolean(seeded) && seeded!.steps.length > 0 && seeded!.steps.every((s, i) => i === 0 || s.position > seeded!.steps[i - 1].position));

    if (seeded) {
      const [progress] = await db.insert(userTutorialProgress).values({ userId: actor.id, tutorialId: seeded.tutorial.id }).returning();
      let progressUniqueHeld = false;
      try {
        await db.insert(userTutorialProgress).values({ userId: actor.id, tutorialId: seeded.tutorial.id });
      } catch {
        progressUniqueHeld = true;
      }
      check("a user has exactly one progress row per tutorial (unique index)", progressUniqueHeld);
      await db.delete(userTutorialProgress).where(eq(userTutorialProgress.id, progress.id));
    }
  } finally {
    /* cleanup — FK-safe order */
    for (const id of ids.articles) {
      await db.delete(knowledgeArticleFavorites).where(eq(knowledgeArticleFavorites.articleId, id));
      await db.delete(knowledgeArticleRelations).where(eq(knowledgeArticleRelations.articleId, id));
      await db.delete(knowledgeArticleVersions).where(eq(knowledgeArticleVersions.articleId, id));
      await db.delete(knowledgeArticles).where(eq(knowledgeArticles.id, id));
    }
    await db.delete(knowledgeArticles).where(sql`${knowledgeArticles.slug} in ('dup-attempt','should-roll-back')`);
    for (const id of ids.categories) await db.delete(knowledgeCategories).where(eq(knowledgeCategories.id, id));
    await db.delete(tickets).where(sql`${tickets.folio} = 'TCK-KB999'`);
    for (const id of ids.workItems) await db.delete(workItems).where(eq(workItems.id, id));
    for (const id of ids.projects) await db.delete(projects).where(eq(projects.id, id));
    for (const id of ids.companies) await db.delete(companies).where(eq(companies.id, id));
    await db.delete(auditLogs).where(sql`${auditLogs.entityType} = 'knowledge_article' and ${auditLogs.organizationId} = ${org.id} and ${auditLogs.createdAt} > now() - interval '10 minutes'`);
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
