import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientServices, companies, services, serviceVariants, vendorContacts, vendors } from "@/db/schema";

/** Data layer for the Vendor detail page — mirrors company360-data.ts's shape, at Vendor scale (no rollup aggregates/alerts needed yet). */

export async function getVendor(orgId: number, vendorId: number) {
  const [row] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, orgId)));
  return row ?? null;
}

export async function getVendorContacts(orgId: number, vendorId: number) {
  return db
    .select()
    .from(vendorContacts)
    .where(and(eq(vendorContacts.organizationId, orgId), eq(vendorContacts.vendorId, vendorId)))
    .orderBy(desc(vendorContacts.isPrimary), asc(vendorContacts.lastName));
}

/** Catalog Services this vendor is the default supplier for — "los productos y servicios que ellos ofrecen" (distinct from getVendorPurchases, which is what clients actually contracted). */
export async function getVendorProducts(orgId: number, vendorId: number) {
  return db
    .select({ id: services.id, name: services.name, category: services.category })
    .from(services)
    .where(and(eq(services.organizationId, orgId), eq(services.vendorId, vendorId)))
    .orderBy(asc(services.name));
}

/** Every client_services row that names this vendor as its provider — "los productos y servicios que le compramos", grouped by client on the page. */
export async function getVendorPurchases(orgId: number, vendorId: number) {
  return db
    .select({
      cs: clientServices,
      companyName: companies.name,
      serviceName: services.name,
      variantName: serviceVariants.name,
    })
    .from(clientServices)
    .innerJoin(companies, eq(clientServices.companyId, companies.id))
    .innerJoin(services, eq(clientServices.serviceId, services.id))
    .leftJoin(serviceVariants, eq(clientServices.variantId, serviceVariants.id))
    .where(and(eq(clientServices.organizationId, orgId), eq(clientServices.vendorId, vendorId)))
    .orderBy(asc(companies.name), asc(services.name));
}
