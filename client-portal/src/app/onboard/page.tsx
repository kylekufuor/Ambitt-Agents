import OnboardLanding from "./landing";

// Public entry point. No token in the URL — anyone with the link can land
// here. The landing collects name + email, calls /api/onboard/find-or-create
// (which proxies to Oracle), then redirects to /onboard/[token] for the
// rest of the slideshow.
//
// Middleware bypasses /onboard/** so this is reachable to anonymous visitors.
export const dynamic = "force-dynamic";

export default function OnboardEntryPage() {
  return <OnboardLanding />;
}
