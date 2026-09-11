/*
 * Arms the entrance animations before the first paint.
 *
 * The stylesheet hides nothing until <html> carries .js-anim. If that class
 * only arrived with React, the page would paint fully, blank when hydration
 * landed, then replay its entrance: a visible flash. So this one inline
 * script adds the class first, when motion is wanted and the observer
 * exists, and the hero's CSS keyframes start from the first frame.
 *
 * Safety: if the motion runtime never marks .js-ok (hydration failed, a
 * script error, a very slow network), the class is removed after 4 s and the
 * page is simply composed. Nothing a visitor reads ever depends on React.
 */
const BOOT =
  "(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;" +
  "var h=document.documentElement;h.classList.add('js-anim');" +
  "setTimeout(function(){if(!h.classList.contains('js-ok'))h.classList.remove('js-anim')},4000)}catch(e){}})()";

export function MotionBoot() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
