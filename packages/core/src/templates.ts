import type { CredentialType, TemplateId } from "./types.js";

export interface Template {
  id: TemplateId;
  label: string;
  description: string;
  credentialType: CredentialType;
  /** Exactly these keys must be disclosed — no more, no fewer. */
  reveals: string[];
  /** Human-readable, for the holder's confirm screen. */
  hides: string[];
  icon: string;
  /** The predicate the disclosed values must actually satisfy. */
  satisfied: (claims: Record<string, unknown>) => boolean;
}

export const TEMPLATES: Record<TemplateId, Template> = {
  i_am_adult: {
    id: "i_am_adult",
    label: "I am an adult",
    description: "Proves you are 18 or older",
    credentialType: "nimc",
    reveals: ["is_adult"],
    hides: ["NIN", "date of birth", "age band", "nationality"],
    icon: "🪪",
    satisfied: (c) => c.is_adult === true,
  },
  ng_under_26: {
    id: "ng_under_26",
    label: "Nigerian, under 26",
    description: "Age band and nationality — for student or youth pricing",
    credentialType: "nimc",
    reveals: ["is_adult", "age_band", "nationality"],
    hides: ["NIN", "date of birth", "name"],
    icon: "🎓",
    satisfied: (c) =>
      c.is_adult === true && c.age_band === "18-25" && c.nationality === "NG",
  },
  i_earn_enough: {
    id: "i_earn_enough",
    label: "I earn ₦100k+ a month",
    description: "An income threshold and an active account",
    credentialType: "bank",
    reveals: ["account_status", "income_at_least_100k"],
    hides: ["exact salary", "income bracket", "account number", "BVN", "balance"],
    icon: "💰",
    satisfied: (c) =>
      c.account_status === "active" && c.income_at_least_100k === true,
  },
  i_am_verified: {
    id: "i_am_verified",
    label: "I am bank verified",
    description: "Proves your BVN is verified",
    credentialType: "bank",
    reveals: ["bvn_verified"],
    hides: ["account number", "BVN", "balance", "income"],
    icon: "✅",
    satisfied: (c) => c.bvn_verified === true,
  },
  card_active: {
    id: "card_active",
    label: "I have a working card",
    description: "Proves you hold an active debit card",
    credentialType: "card",
    // The card number is never a claim, so it can never be disclosed.
    // The issuing bank attests the card works; Pruve never sees a PAN.
    reveals: ["card_active"],
    hides: ["card number", "CVV", "expiry", "balance", "card tier"],
    icon: "💳",
    satisfied: (c) => c.card_active === true,
  },
  card_premium: {
    id: "card_premium",
    label: "I hold a premium card",
    description: "Proves your card tier without revealing the card",
    credentialType: "card",
    reveals: ["card_active", "card_is_premium"],
    hides: ["card number", "CVV", "expiry", "balance", "issuing bank"],
    icon: "🪙",
    satisfied: (c) => c.card_active === true && c.card_is_premium === true,
  },
};

export const TEMPLATE_LIST: Template[] = Object.values(TEMPLATES);
