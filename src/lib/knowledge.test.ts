import { describe, expect, it } from "vitest";
import {
  anonymizeText,
  canCreateDraft,
  canEditArticle,
  canPublish,
  canReview,
  canTransitionArticle,
  knowledgeStepsSchema,
  knowledgeTagsSchema,
  slugify,
} from "./knowledge";

describe("canTransitionArticle", () => {
  it("allows the linear draft -> in_review -> published -> archived path", () => {
    expect(canTransitionArticle("draft", "in_review")).toBe(true);
    expect(canTransitionArticle("in_review", "published")).toBe(true);
    expect(canTransitionArticle("published", "archived")).toBe(true);
  });

  it("allows publishing directly from draft (elevated roles skip formal review)", () => {
    expect(canTransitionArticle("draft", "published")).toBe(true);
  });

  it("allows changes-requested (in_review -> draft) and restore (archived -> draft)", () => {
    expect(canTransitionArticle("in_review", "draft")).toBe(true);
    expect(canTransitionArticle("archived", "draft")).toBe(true);
  });

  it("rejects skipping states or going backwards illegally", () => {
    expect(canTransitionArticle("draft", "archived")).toBe(false);
    expect(canTransitionArticle("published", "draft")).toBe(false);
    expect(canTransitionArticle("published", "in_review")).toBe(false);
    expect(canTransitionArticle("archived", "published")).toBe(false);
  });
});

describe("role permissions", () => {
  it("technician can create drafts but not publish", () => {
    expect(canCreateDraft("technician")).toBe(true);
    expect(canPublish("technician")).toBe(false);
  });

  it("project_manager can review but not publish", () => {
    expect(canReview("project_manager")).toBe(true);
    expect(canPublish("project_manager")).toBe(false);
  });

  it("administrator and director can publish; superadmin always can", () => {
    expect(canPublish("administrator")).toBe(true);
    expect(canPublish("director")).toBe(true);
    expect(canPublish("superadmin")).toBe(true);
  });

  it("client has no authoring/review/publish rights", () => {
    expect(canCreateDraft("client")).toBe(false);
    expect(canReview("client")).toBe(false);
    expect(canPublish("client")).toBe(false);
  });
});

describe("canEditArticle", () => {
  it("the author can edit their own non-archived article", () => {
    expect(canEditArticle("technician", { status: "draft", authorId: 7 }, 7)).toBe(true);
    expect(canEditArticle("technician", { status: "in_review", authorId: 7 }, 7)).toBe(true);
  });

  it("the author cannot edit once archived", () => {
    expect(canEditArticle("technician", { status: "archived", authorId: 7 }, 7)).toBe(false);
  });

  it("another technician cannot edit someone else's draft", () => {
    expect(canEditArticle("technician", { status: "draft", authorId: 7 }, 9)).toBe(false);
  });

  it("a reviewer (project_manager) can edit only while in review", () => {
    expect(canEditArticle("project_manager", { status: "in_review", authorId: 7 }, 9)).toBe(true);
    expect(canEditArticle("project_manager", { status: "draft", authorId: 7 }, 9)).toBe(false);
  });

  it("publisher roles (administrator/director/superadmin) can edit anything non-archived", () => {
    expect(canEditArticle("administrator", { status: "draft", authorId: 7 }, 9)).toBe(true);
    expect(canEditArticle("director", { status: "published", authorId: 7 }, 9)).toBe(true);
    expect(canEditArticle("administrator", { status: "archived", authorId: 7 }, 9)).toBe(false);
  });
});

describe("anonymizeText", () => {
  it("replaces the client and contact names wherever they appear", () => {
    const out = anonymizeText("Acme Corp reportó el problema. Contacto: Jane Doe.", {
      companyName: "Acme Corp",
      contactName: "Jane Doe",
    });
    expect(out).toBe("[cliente] reportó el problema. Contacto: [contacto].");
  });

  it("redacts emails and phone numbers even without names configured", () => {
    const out = anonymizeText("Escribe a soporte@acme.com o al 555-123-4567.", {});
    expect(out).toContain("[correo]");
    expect(out).toContain("[teléfono]");
    expect(out).not.toContain("soporte@acme.com");
  });

  it("passes through null and empty text unchanged", () => {
    expect(anonymizeText(null, { companyName: "Acme" })).toBeNull();
  });
});

describe("slugify", () => {
  it("lowercases, strips accents and collapses non-alphanumerics", () => {
    expect(slugify("¿Cómo resolver el problema de VPN?")).toBe("como-resolver-el-problema-de-vpn");
  });

  it("never returns an empty string", () => {
    expect(slugify("!!!")).toBe("articulo");
  });
});

describe("content schemas", () => {
  it("bounds the number of steps and tags", () => {
    expect(knowledgeStepsSchema.safeParse(Array(31).fill("x")).success).toBe(false);
    expect(knowledgeStepsSchema.safeParse(["Paso uno", "Paso dos"]).success).toBe(true);
    expect(knowledgeTagsSchema.safeParse(Array(16).fill("tag")).success).toBe(false);
  });

  it("rejects empty-string steps/tags", () => {
    expect(knowledgeStepsSchema.safeParse([""]).success).toBe(false);
    expect(knowledgeTagsSchema.safeParse([""]).success).toBe(false);
  });
});
