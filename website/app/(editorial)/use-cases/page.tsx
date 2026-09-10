import { Footer } from "../_components/footer";
import { BookkeepingCase } from "../_components/cases/bookkeeping";
import { CasesClosing } from "../_components/cases/closing";
import { CommercialRealEstateCase } from "../_components/cases/commercial-real-estate";
import { HomeServicesCase } from "../_components/cases/home-services";
import { CasesIntro } from "../_components/cases/intro";
import { TaxAndAccountingCase } from "../_components/cases/tax-and-accounting";
import { Masthead } from "../_components/masthead";
import { pageMetadata } from "../_components/metadata";

export const metadata = pageMetadata({
  path: "/use-cases",
  title: "Ambitt Agents: the cases, four industries, one workforce",
  description:
    "Four jobs, four industries, one workforce. What the client asked for in plain English, what the agent does about it, and what lands in the inbox.",
});

export default function UseCasesPage() {
  return (
    <>
      <Masthead page="cases" />
      <main id="main">
        <CasesIntro />
        <BookkeepingCase />
        <CommercialRealEstateCase />
        <HomeServicesCase />
        <TaxAndAccountingCase />
        <CasesClosing />
      </main>
      <Footer page="cases" />
    </>
  );
}
