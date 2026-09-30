import { Ledger } from "~/app/_components/ledger";
import { Reference, TrustStrip } from "~/app/_components/reference";

export default function Home() {
  return (
    <>
      <TrustStrip />
      <Ledger />
      <Reference />
    </>
  );
}
