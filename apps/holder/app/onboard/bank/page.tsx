import { OnboardForm } from "../OnboardForm";

/**
 * Bank linking takes the BVN, not an account number.
 *
 * The BVN is the identifier a Nigerian bank actually knows you by, and one
 * BVN spans every bank you use — so it is what the issuer looks you up with.
 * It is used for the lookup and never stored, and it is never made into a
 * claim, so it can never appear in a proof.
 */
export default function OnboardBank() {
  return (
    <OnboardForm
      kind="bank"
      field="bvn"
      digits={11}
      title="Link your bank"
      blurb="Your BVN fetches your banking credential. It is used once to find you and is never stored — not by us, and not on this phone."
      label="Bank Verification Number"
      placeholder="11 digits"
      never={["Your BVN", "Balance", "Transactions", "Exact salary"]}
    />
  );
}
