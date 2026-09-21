import { OnboardForm } from "../OnboardForm";

/**
 * Card linking takes the ACCOUNT number, never the card number.
 *
 * The bank already knows which card belongs to which account, so it attests
 * that the card works. There is no field here that could carry a PAN, which
 * is why none of those values can ever appear in a proof.
 */
export default function OnboardCard() {
  return (
    <OnboardForm
      kind="card"
      field="account"
      sampleKey="account"
      digits={10}
      title="Link your card"
      blurb="Your bank confirms the card is active. We never ask for the card number — enter the account it belongs to."
      label="Account the card belongs to"
      placeholder="10 digits"
      never={["Card number", "Expiry date", "CVV", "Balance"]}
    />
  );
}
