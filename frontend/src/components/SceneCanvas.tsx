import { useEffect, useRef } from "react";
import { drawScene, type SceneData } from "../lib/scene";

interface Props {
  scene: SceneData | null;
  image?: string | null; // base64 JPEG (video mode) or URL
  showRoi?: boolean;
  showVectors?: boolean;
  showLabels?: boolean;
  focusTrackId?: number | null;
  animate?: boolean;
  className?: string;
}

/** Renders an analysed frame (live or stored snapshot) onto a canvas. */
export default function SceneCanvas({ scene, image, showRoi = true, showVectors = true, showLabels = true, focusTrackId, animate = true, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgSrc = useRef<string | null>(null);
  const propsRef = useRef({ scene, showRoi, showVectors, showLabels, focusTrackId });
  propsRef.current = { scene, showRoi, showVectors, showLabels, focusTrackId };

  const render = () => {
    const cv = canvasRef.current;
    const p = propsRef.current;
    if (!cv || !p.scene) return;
    const { width, height } = p.scene.camera;
    if (cv.width !== width || cv.height !== height) {
      cv.width = width;
      cv.height = height;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    drawScene(ctx, p.scene, {
      showRoi: p.showRoi,
      showVectors: p.showVectors,
      showLabels: p.showLabels,
      focusTrackId: p.focusTrackId,
      image: imgRef.current?.complete ? imgRef.current : null,
      t: performance.now() / 1000,
    });
  };

  // decode new video frames
  useEffect(() => {
    if (!image) {
      imgRef.current = null;
      imgSrc.current = null;
      return;
    }
    const src = image.startsWith("data:") || image.startsWith("http") || image.startsWith("blob:") || image.startsWith("/") ? image : `data:image/jpeg;base64,${image}`;
    if (src === imgSrc.current) return;
    imgSrc.current = src;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      render();
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  useEffect(render);

  // gentle animation loop for pulsing critical boxes, ETA badges and rain
  useEffect(() => {
    if (!animate) return;
    let id: number;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 66) {
        last = t;
        render();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  return <canvas ref={canvasRef} className={className ?? "block h-auto w-full rounded-xl bg-ink-900"} style={{ aspectRatio: scene ? `${scene.camera.width}/${scene.camera.height}` : "16/9" }} />;
}
