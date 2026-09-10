import { THEME_KEY } from "./theme-key";

/*
 * Applies a visitor's saved light/dark choice before the page is drawn.
 *
 * This is the one inline script on these pages, and it has to be: the choice
 * lives in localStorage, which the server cannot see, so anything that waited
 * for React to hydrate would paint the wrong theme first and then flip. It
 * only sets data-theme on <html>; the stylesheet does the rest, including the
 * toggle's label. With no saved choice it does nothing and the OS preference
 * (prefers-color-scheme) decides. The root layout sets suppressHydrationWarning
 * on <html> because of exactly this attribute.
 */
const BOOT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function ThemeBoot() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
