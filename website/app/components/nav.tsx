import { Masthead } from "../(editorial)/_components/masthead";

/** The same navigation on marketing, documentation and account-help pages. */
export function Nav({ page = "other" }: { page?: "docs" | "other" }) {
  return <Masthead page={page} />;
}
