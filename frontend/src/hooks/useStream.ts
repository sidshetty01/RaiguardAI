import { useEffect, useRef, useState } from "react";
import { wsUrl } from "../api/client";
import type { Frame } from "../api/types";

/** Subscribe to the live analysed frames of one camera / video runtime. */
export function useStream(runtimeId: string | null) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState<string | null>(null);
  const pending = useRef<Frame | null>(null);
  const raf = useRef<number>();

  useEffect(() => {
    setFrame(null);
    setEnded(null);
    if (!runtimeId) return;
    let closed = false;
    let retry: number | undefined;
    let ws: WebSocket | null = null;

    const flush = () => {
      raf.current = undefined;
      if (pending.current) setFrame(pending.current);
    };

    const connect = () => {
      ws = new WebSocket(wsUrl(`/ws/stream/${runtimeId}`));
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "end") {
          setEnded(msg.error ?? "Stream finished");
          return;
        }
        if (msg.type !== "frame") return;
        // keep the last image when a frame arrives without one (initial snapshot)
        if (!msg.image && pending.current?.image && pending.current.camera_id === msg.camera_id) msg.image = pending.current.image;
        pending.current = msg;
        raf.current ??= requestAnimationFrame(flush);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(connect, 2500);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      if (raf.current) cancelAnimationFrame(raf.current);
      pending.current = null;
      ws?.close();
    };
  }, [runtimeId]);

  return { frame, connected, ended };
}
