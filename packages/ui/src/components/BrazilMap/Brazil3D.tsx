import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadBrazilTerrain, BRAZIL_BBOX } from "./elevation";
import "./Brazil3D.css";

const SEGMENTS = 200;
const HORIZONTAL_SPAN = 10;
// Real elevation (max ~2,994m at Pico da Neblina) is tiny relative to
// Brazil's ~4,500km width — at true 1:1 scale the relief would be
// imperceptible, so this is a deliberate exaggeration for a legible,
// sculptural relief model, not survey-accurate terrain. It's expressed as a
// multiple of true scale (computed below from the actual horizontal
// compression) rather than a hand-tuned constant — a flat magic number here
// previously came out ~6x too aggressive and turned gentle real slopes
// (100-300m over ~22km grid cells) into near-vertical spikes.
const VERTICAL_EXAGGERATION = 45;

type Status = "loading" | "ready" | "error";

export function Brazil3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let frameId = 0;
    let dispose = () => {};

    async function setup() {
      if (!containerRef.current) return;

      let terrain;
      try {
        terrain = await loadBrazilTerrain();
      } catch (err) {
        console.error("Failed to load Brazil terrain data", err);
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled || !containerRef.current) return;

      const { minLon, maxLon, minLat, maxLat } = BRAZIL_BBOX;
      const centerLon = (minLon + maxLon) / 2;
      const centerLat = (minLat + maxLat) / 2;
      const lonSpan = maxLon - minLon;
      const latSpan = maxLat - minLat;
      const scale = HORIZONTAL_SPAN / Math.max(lonSpan, latSpan);
      const rows = SEGMENTS + 1;

      // True-scale meters-per-world-unit at Brazil's latitude, then
      // exaggerated — see VERTICAL_EXAGGERATION above.
      const metersPerDegree = 111_320 * Math.cos((centerLat * Math.PI) / 180);
      const verticalScale = (scale / metersPerDegree) * VERTICAL_EXAGGERATION;

      const positions = new Array<number>(rows * rows * 3);
      const inside = new Array<boolean>(rows * rows);
      let maxHeight = 0;

      for (let j = 0; j < rows; j++) {
        const lat = maxLat - (j / SEGMENTS) * latSpan;
        for (let i = 0; i < rows; i++) {
          const lon = minLon + (i / SEGMENTS) * lonSpan;
          const idx = j * rows + i;
          const isIn = terrain.isInsideBrazil(lon, lat);
          inside[idx] = isIn;
          const elevation = isIn ? Math.max(0, terrain.elevationAt(lon, lat)) : 0;
          const y = elevation * verticalScale;
          maxHeight = Math.max(maxHeight, y);
          positions[idx * 3] = (lon - centerLon) * scale;
          positions[idx * 3 + 1] = y;
          positions[idx * 3 + 2] = -(lat - centerLat) * scale;
        }
      }

      const baseColor = new THREE.Color("#1a7a4a");
      const peakColor = new THREE.Color("#cfe9d3");
      const colors = new Array<number>(rows * rows * 3);
      for (let idx = 0; idx < rows * rows; idx++) {
        const t = maxHeight > 0 ? (positions[idx * 3 + 1] ?? 0) / maxHeight : 0;
        const c = baseColor.clone().lerp(peakColor, Math.min(1, t) * 0.75);
        colors[idx * 3] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;
      }

      // Only emit triangles fully inside Brazil's coastline — the mesh's
      // silhouette follows the real coast instead of the bounding-box
      // rectangle, and there's no wasted invisible geometry over open ocean
      // or neighboring countries.
      const indices: number[] = [];
      for (let j = 0; j < SEGMENTS; j++) {
        for (let i = 0; i < SEGMENTS; i++) {
          const a = j * rows + i;
          const b = a + 1;
          const c = a + rows;
          const d = c + 1;
          if (!(inside[a] && inside[b] && inside[c] && inside[d])) continue;
          indices.push(a, c, b, b, c, d);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0,
        roughness: 0.85,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);

      const scene = new THREE.Scene();
      scene.add(mesh);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
      sun.position.set(4, 6, 3);
      scene.add(sun);
      const fillLight = new THREE.DirectionalLight(0xdce8ff, 0.35);
      fillLight.position.set(-4, 2, -3);
      scene.add(fillLight);

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 7, 9);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      containerRef.current.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 4;
      controls.maxDistance = 20;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.1;

      const localRenderer = renderer;
      const localControls = controls;
      function animate() {
        localControls.update();
        localRenderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      }
      animate();

      resizeObserver = new ResizeObserver(() => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        localRenderer.setSize(w, h);
      });
      resizeObserver.observe(containerRef.current);

      dispose = () => {
        geometry.dispose();
        material.dispose();
      };

      if (!cancelled) setStatus("ready");
    }

    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      controls?.dispose();
      resizeObserver?.disconnect();
      dispose();
      if (renderer) {
        containerRef.current?.contains(renderer.domElement) && containerRef.current.removeChild(renderer.domElement);
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div className="brazil-3d">
      <div ref={containerRef} className="brazil-3d__canvas" />
      {status === "loading" && <div className="brazil-3d__status">Loading terrain…</div>}
      {status === "error" && <div className="brazil-3d__status">Couldn't load terrain data.</div>}
    </div>
  );
}
