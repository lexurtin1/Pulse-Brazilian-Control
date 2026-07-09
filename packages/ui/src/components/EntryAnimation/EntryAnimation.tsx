import { useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { animate, stagger } from "animejs";
import {
  BRAZIL_OUTLINE_VIEWBOX,
  BRAZIL_OUTLINE_PATH,
  LATAM_OUTLINE_PATH,
  WORLD_MASSING_PATH,
} from "../../design/generated/brazil-outline";
import "./EntryAnimation.css";

gsap.registerPlugin(ScrollTrigger);

interface EntryAnimationProps {
  /** The live map's wrapper element — faded in during the final handoff beat. */
  mapRef: RefObject<HTMLDivElement>;
  onComplete: () => void;
}

// Fixed illustrative points (percent of the silhouette's bounding box) for
// the "account nodes / region pulses" step — not projected from live pin
// data, so this stays self-contained and doesn't need d3-geo at runtime.
const MARKER_POINTS = [
  { x: 48, y: 22, pulse: false },
  { x: 60, y: 29, pulse: true },
  { x: 39, y: 37, pulse: false },
  { x: 52, y: 47, pulse: true },
  { x: 34, y: 54, pulse: false },
  { x: 61, y: 57, pulse: false },
  { x: 45, y: 68, pulse: true },
  { x: 50, y: 80, pulse: false },
];

export function EntryAnimation({ mapRef, onComplete }: EntryAnimationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const brazilPathRef = useRef<SVGPathElement>(null);
  const latamPathRef = useRef<SVGPathElement>(null);
  const worldPathRef = useRef<SVGPathElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const brazilPath = brazilPathRef.current;
      const latamPath = latamPathRef.current;
      const worldPath = worldPathRef.current;
      const markerEls = markersRef.current?.querySelectorAll<HTMLElement>(".entry-animation__marker") ?? [];
      const mapEl = mapRef.current;
      if (!brazilPath || !latamPath || !worldPath) {
        onComplete();
        return;
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reducedMotion) {
        gsap.set(brazilPath, { fillOpacity: 1, strokeOpacity: 0 });
        gsap.set(latamPath, { opacity: 0.5 });
        gsap.set(worldPath, { opacity: 0.25 });
        gsap.set(markerEls, { opacity: 1, scale: 1 });
        if (mapEl) gsap.set(mapEl, { opacity: 1 });
        if (fieldRef.current) gsap.set(fieldRef.current, { opacity: 0 });
        onComplete();
        return;
      }

      const brazilLength = brazilPath.getTotalLength();
      gsap.set(brazilPath, {
        strokeDasharray: brazilLength,
        strokeDashoffset: brazilLength,
        fillOpacity: 0,
        strokeOpacity: 1,
      });
      gsap.set(latamPath, { opacity: 0 });
      gsap.set(worldPath, { opacity: 0 });
      gsap.set(markerEls, { opacity: 0, scale: 0.4 });
      if (mapEl) gsap.set(mapEl, { opacity: 0 });

      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        onComplete,
      });

      // 1. Brazil outline draws in, then fills solid.
      tl.to(brazilPath, { strokeDashoffset: 0, duration: 2.2 });
      tl.to(brazilPath, { fillOpacity: 1, strokeOpacity: 0, duration: 0.6 }, "-=0.1");

      // 2. Internal account nodes / region pulses stagger in (Anime.js).
      tl.add(() => {
        animate(markerEls, {
          opacity: [0, 1],
          scale: [0.4, 1],
          duration: 500,
          delay: stagger(70),
          ease: "outExpo",
        });
      }, "-=0.1");

      // 3. Staged zoom-out: LATAM bleeds in at low contrast, then world
      // massing fainter still, while the live map fades in underneath and
      // this whole field fades out — choreographed via a ScrollTrigger bound
      // to a synthetic, self-driven scroll rather than real user scrolling,
      // since the app shell is a fixed, non-scrolling viewport.
      const zoomOutTl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      zoomOutTl.to(latamPath, { opacity: 0.5, duration: 1 });
      zoomOutTl.to(worldPath, { opacity: 0.25, duration: 1 }, "-=0.4");
      if (mapEl) zoomOutTl.to(mapEl, { opacity: 1, duration: 1.1 }, "-=0.6");
      if (fieldRef.current) zoomOutTl.to(fieldRef.current, { opacity: 0, duration: 1.1 }, "<");

      if (scrollerRef.current && spacerRef.current) {
        const st = ScrollTrigger.create({
          scroller: scrollerRef.current,
          trigger: spacerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
          animation: zoomOutTl,
        });

        tl.add(() => {
          const maxScroll = spacerRef.current!.scrollHeight - scrollerRef.current!.clientHeight;
          gsap.to(scrollerRef.current, {
            scrollTop: maxScroll,
            duration: 2.4,
            ease: "power1.inOut",
            onComplete: () => st.kill(),
          });
        });
        tl.to({}, { duration: 2.4 }); // hold the master timeline until the scrubbed scroll finishes
      } else {
        tl.add(zoomOutTl);
      }
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="entry-animation" aria-hidden="true">
      <div ref={fieldRef} className="entry-animation__field">
        <svg viewBox={BRAZIL_OUTLINE_VIEWBOX} className="entry-animation__svg" preserveAspectRatio="xMidYMid meet">
          <path ref={worldPathRef} d={WORLD_MASSING_PATH} className="entry-animation__path entry-animation__path--world" />
          <path ref={latamPathRef} d={LATAM_OUTLINE_PATH} className="entry-animation__path entry-animation__path--latam" />
          <path ref={brazilPathRef} d={BRAZIL_OUTLINE_PATH} className="entry-animation__path entry-animation__path--brazil" />
        </svg>
        <div ref={markersRef} className="entry-animation__markers">
          {MARKER_POINTS.map((point, index) => (
            <span
              key={index}
              className="entry-animation__marker"
              data-pulse={point.pulse || undefined}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            />
          ))}
        </div>
      </div>
      {/* Off-screen synthetic scroller — exists only so ScrollTrigger has a
          real, self-driven scroll position to scrub against. Never seen or
          touched by the user. */}
      <div ref={scrollerRef} className="entry-animation__scroller">
        <div ref={spacerRef} className="entry-animation__spacer" />
      </div>
    </div>
  );
}
