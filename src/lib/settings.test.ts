import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  CATALOG_KINDS,
  CATALOG_KIND_KEYS,
  ENV_CHECKS,
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  generateApiKey,
  generateInvitationToken,
  hashApiKey,
  isCatalogKind,
  maskSecret,
  organizationProfileSchema,
  projectTemplateConfigSchema,
  recurrenceDefaultsSchema,
  reportBrandingSchema,
  settingsDefaults,
} from "./settings";

describe("settings schemas", () => {
  it("every section parses an empty object into defaults", () => {
    for (const key of SETTINGS_KEYS) {
      expect(() => settingsDefaults(key)).not.toThrow();
    }
  });

  it("organization profile validates brand color and logo format", () => {
    expect(organizationProfileSchema.safeParse({ brandColor: "#12ab34" }).success).toBe(true);
    expect(organizationProfileSchema.safeParse({ brandColor: "red" }).success).toBe(false);
    expect(
      organizationProfileSchema.safeParse({ logo: "data:image/png;base64,iVBOR" }).success,
    ).toBe(true);
    expect(
      organizationProfileSchema.safeParse({ logo: "https://example.com/logo.png" }).success,
    ).toBe(false);
    expect(organizationProfileSchema.safeParse({ logo: "data:text/html;base64,PGI+" }).success).toBe(
      false,
    );
  });

  it("empty strings become undefined on optional fields (form convention)", () => {
    const parsed = organizationProfileSchema.parse({ legalName: "", taxId: "  " });
    expect(parsed.legalName).toBeUndefined();
    expect(parsed.taxId).toBeUndefined();
  });

  it("recurrence defaults bound the failure limit and time format", () => {
    expect(recurrenceDefaultsSchema.parse({}).maxConsecutiveFailures).toBe(3);
    expect(recurrenceDefaultsSchema.safeParse({ maxConsecutiveFailures: "5" }).success).toBe(true);
    expect(recurrenceDefaultsSchema.safeParse({ maxConsecutiveFailures: 0 }).success).toBe(false);
    expect(recurrenceDefaultsSchema.safeParse({ maxConsecutiveFailures: 11 }).success).toBe(false);
    expect(recurrenceDefaultsSchema.safeParse({ defaultTimeOfDay: "25:00" }).success).toBe(false);
    expect(recurrenceDefaultsSchema.parse({ defaultTimeOfDay: "07:30" }).defaultTimeOfDay).toBe(
      "07:30",
    );
  });

  it("report branding bounds long corporate texts", () => {
    expect(reportBrandingSchema.safeParse({ corporateIntro: "x".repeat(2001) }).success).toBe(false);
    expect(reportBrandingSchema.parse({ footerText: " pie " }).footerText).toBe("pie");
  });

  it("a stored value that fails validation is recoverable via defaults", () => {
    const bad = SETTINGS_SCHEMAS["recurrence.defaults"].safeParse({ maxConsecutiveFailures: -4 });
    expect(bad.success).toBe(false);
    expect(settingsDefaults("recurrence.defaults").defaultTimezone).toBe("America/Mexico_City");
  });
});

describe("catalog kinds", () => {
  it("declares the six kinds with unique labels", () => {
    expect(CATALOG_KIND_KEYS).toHaveLength(6);
    const labels = CATALOG_KIND_KEYS.map((k) => CATALOG_KINDS[k].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("only ticket categories have children", () => {
    expect(CATALOG_KINDS.ticket_category.hasChildren).toBe(true);
    for (const kind of CATALOG_KIND_KEYS.filter((k) => k !== "ticket_category")) {
      expect(CATALOG_KINDS[kind].hasChildren).toBe(false);
    }
  });

  it("isCatalogKind rejects unknown kinds", () => {
    expect(isCatalogKind("ticket_category")).toBe(true);
    expect(isCatalogKind("nonsense")).toBe(false);
  });

  it("project template config requires at least one list", () => {
    expect(projectTemplateConfigSchema.safeParse({ lists: [] }).success).toBe(false);
    expect(projectTemplateConfigSchema.parse({ lists: ["Planeación", "Cierre"] }).lists).toHaveLength(2);
  });
});

describe("secret masking", () => {
  it("never reveals more than the first 4 characters", () => {
    const secret = "supersecretvalue1234567890";
    const masked = maskSecret(secret);
    expect(masked).toContain("supe");
    expect(masked).not.toContain("secretvalue");
    expect(masked).toContain(`${secret.length} caracteres`);
  });

  it("short values are fully hidden and empty values are a dash", () => {
    expect(maskSecret("abc")).toBe("••••");
    expect(maskSecret("")).toBe("—");
    expect(maskSecret(undefined)).toBe("—");
  });

  it("every declared secret env var is masked in the checks list", () => {
    for (const check of ENV_CHECKS.filter((c) => c.name.includes("SECRET") || c.name.includes("PASSWORD"))) {
      expect(check.secret).toBe(true);
    }
  });
});

describe("api keys", () => {
  it("generates prefixed tokens whose hash round-trips", () => {
    const { token, prefix, tokenHash } = generateApiKey();
    expect(token.startsWith(`${API_KEY_PREFIX}_`)).toBe(true);
    expect(token.startsWith(prefix)).toBe(true);
    expect(hashApiKey(token)).toBe(tokenHash);
    expect(tokenHash).toHaveLength(64); // sha256 hex
    expect(tokenHash).not.toContain(token.slice(-10));
  });

  it("two generations never collide", () => {
    expect(generateApiKey().token).not.toBe(generateApiKey().token);
    expect(generateInvitationToken()).not.toBe(generateInvitationToken());
  });
});
