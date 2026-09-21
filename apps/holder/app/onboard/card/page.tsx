import { OnboardForm } from "../OnboardForm";

/**
 * Card linking takes the BVN, never the card number.
 *
 * The bank already knows which cards belong to you, so it attests that yours
 * is active. There is no field here that could carry a PAN, which is why none
 * of those values can ever appear in a proof — and why this stays outside
 * PCI-DSS scope entirely.
 */
export default function OnboardCard() {
  return (
    <OnboardForm
      kind="card"
      field="bvn"
      digits={11}
      title="Link your card"
      blurb="Your bank confirms your card is active. We never ask for the card number — your BVN is enough."
      label="Bank Verification Number"
      placeholder="11 digits"
      never={["Card number", "Expiry date", "CVV", "Your BVN"]}
    />
  );
}
