/**
 * Channel adapter layer (Inbox, 2026-07-18). Watson's messaging is
 * channel-agnostic (PRD principle: "WhatsApp is a channel, not the system").
 * This module declares the adapter contract and the registry; only `internal`
 * is operational — nothing here talks to any external service, and adding a
 * real channel later means implementing ONE adapter, not touching the domain.
 *
 * Pure module: no DB, no network, unit-testable.
 */

export type ChannelKey = "internal" | "whatsapp" | "email" | "teams" | "api";

/** Result of asking a channel to deliver an outbound message. */
export type ChannelSendResult =
  | { ok: true; externalRef: string | null }
  | { ok: false; code: "not_configured" | "not_supported"; message: string };

export type OutboundMessage = {
  conversationId: number;
  body: string;
  /** Contact the message is addressed to, when the conversation has one. */
  contactId: number | null;
};

/**
 * Contract every channel must implement. `deliver` NEVER throws — it returns
 * a typed result so the domain records the outcome without try/catch litter.
 */
export interface ChannelAdapter {
  readonly key: ChannelKey;
  readonly label: string;
  /** True when the channel can actually deliver today. */
  readonly configured: boolean;
  /** Note shown in the UI explaining the channel's status. */
  readonly statusNote: string;
  deliver(message: OutboundMessage): Promise<ChannelSendResult>;
}

/** Internal channel: messages live in Watson only — delivery is the DB write itself. */
const internalAdapter: ChannelAdapter = {
  key: "internal",
  label: "Interno",
  configured: true,
  statusNote: "Mensajería interna de Watson — operativa.",
  async deliver() {
    return { ok: true, externalRef: null };
  },
};

/** Placeholder for channels that exist in the model but have no integration. */
function unconfiguredAdapter(key: ChannelKey, label: string): ChannelAdapter {
  return {
    key,
    label,
    configured: false,
    statusNote: `${label} no está integrado — los mensajes de este canal se registran manualmente.`,
    async deliver() {
      return {
        ok: false,
        code: "not_configured",
        message: `El canal ${label} no está configurado. El mensaje quedó registrado en Watson, no se envió externamente.`,
      };
    },
  };
}

export const CHANNEL_ADAPTERS: Record<ChannelKey, ChannelAdapter> = {
  internal: internalAdapter,
  whatsapp: unconfiguredAdapter("whatsapp", "WhatsApp"),
  email: unconfiguredAdapter("email", "Email"),
  teams: unconfiguredAdapter("teams", "Microsoft Teams"),
  api: unconfiguredAdapter("api", "API"),
};

export function channelAdapter(key: string): ChannelAdapter | null {
  return key in CHANNEL_ADAPTERS ? CHANNEL_ADAPTERS[key as ChannelKey] : null;
}

/**
 * Channels selectable when REGISTERING a message manually (what actually
 * happened: a WhatsApp arrived, an email went out…). Registering is not
 * sending — the legacy enum values phone/portal/manual stay valid on old rows.
 */
export const REGISTRABLE_CHANNELS: { value: string; label: string }[] = [
  { value: "internal", label: "Interno" },
  { value: "whatsapp", label: "WhatsApp (registro manual)" },
  { value: "email", label: "Email (registro manual)" },
  { value: "teams", label: "Teams (registro manual)" },
  { value: "phone", label: "Teléfono (registro manual)" },
  { value: "manual", label: "Otro / manual" },
];
