import { Footer } from "../_components/footer";
import { CasesIntro } from "../_components/cases/intro";
import { WorkflowCases, WorkflowClose } from "../_components/cases/workflows";
import { Masthead } from "../_components/masthead";
import { pageMetadata } from "../_components/metadata";

export const metadata = pageMetadata({ path: "/use-cases", title: "Ambitt Agents: four workflows inside the portal", description: "Watch four short portal demos: invoice reminders, property leads, roofing follow-ups and missing tax documents. Fictional scenarios, recorded in the current app." });

export default function UseCasesPage() {
  return <><Masthead page="cases" /><main id="main"><CasesIntro /><WorkflowCases /><WorkflowClose /></main><Footer page="cases" /></>;
}
