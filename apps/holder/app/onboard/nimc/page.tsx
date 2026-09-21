import { OnboardForm } from "../OnboardForm";

export default function OnboardNimc() {
  return (
    <OnboardForm
      kind="nimc"
      field="nin"
      sampleKey="nin"
      digits={11}
      title="Link NIMC"
      blurb="Your NIN fetches your identity credential and is not stored — not by us, and not on this phone."
      label="National Identification Number"
      placeholder="11 digits"
      never={["Your name", "Date of birth", "Address", "Photo"]}
    />
  );
}
