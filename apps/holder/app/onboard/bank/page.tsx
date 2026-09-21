import { OnboardForm } from "../OnboardForm";

export default function OnboardBank() {
  return (
    <OnboardForm
      kind="bank"
      field="account"
      sampleKey="account"
      digits={10}
      title="Link your bank"
      blurb="Your bank confirms your account status and income band. We never see a balance or a transaction."
      label="Account number"
      placeholder="10 digits"
      never={["Balance", "Transactions", "Exact salary", "BVN"]}
    />
  );
}
