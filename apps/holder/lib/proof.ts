import { TEMPLATES, type Proof, type TemplateId, type WalletCredential } from "@pruve/core";

export function buildProof(
  entry: WalletCredential,
  templateId: TemplateId,
  binding?: { nonce?: string; audience?: string }
): Proof {
  const template = TEMPLATES[templateId];
  const now = Math.floor(Date.now() / 1000);

  // Filter to the template's fields. Everything else stays on the device as a
  // hash of a salt the verifier will never see.
  const disclosures = entry.disclosures.filter(([, key]) => template.reveals.includes(key));

  if (disclosures.length !== template.reveals.length) {
    throw new Error("This credential does not carry the claims this template needs");
  }

  return {
    proof_id: `prf_${crypto.randomUUID()}`,
    template: templateId,
    credential: entry.credential, // commitments + signature only
    disclosures,
    nonce: binding?.nonce,
    audience: binding?.audience,
    generated_at: now,
    expires_at: now + 300,
  };
}

/** Lets the holder see what the verifier will see, before sending. */
export function previewDisclosure(entry: WalletCredential, templateId: TemplateId) {
  const t = TEMPLATES[templateId];
  const shown = entry.disclosures.filter(([, k]) => t.reveals.includes(k));
  return Object.fromEntries(shown.map(([, k, v]) => [k, v]));
}
