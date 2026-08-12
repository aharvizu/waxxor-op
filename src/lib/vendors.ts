import { z } from "zod";
import { vendorContacts, vendors } from "@/db/schema";

/** Pure domain rules for Vendors — mirrors company360.ts's schema exports, minus the alerting/renewal machinery Vendors doesn't need. */

export const VENDOR_STATUSES = vendors.status.enumValues;
export const VENDOR_CONTACT_TYPES = vendorContacts.contactType.enumValues;

export const vendorStatusSchema = z.enum(VENDOR_STATUSES);
export const vendorContactTypeSchema = z.enum(VENDOR_CONTACT_TYPES);
