import React, { useEffect, useRef } from "react";
// Hosts an external skin in a sandboxed iframe. The skin only renders; this component forwards bet lifecycle events.
export default function SkinFrame({ url, game, platform, result, phase, onTarget, onDone, onStatus, resetKey }) {
  const ref = useRef(null); const readyRef = useRef(false);
  const post = (type, data) => ref.current?.contentWindow?.postMessage({ wagerino: 1, type, data }, "*");
  useEffect(() => {
    const onMsg = (e) => { if (e.source !== ref.current?.contentWindow) return; const m = e.data; if (!m || m.wagerino !== 1) return;
      if (m.type === "ready") { readyRef.current = true; post("init", { game: { address: game.address, name: game.name, mode: game.mode, rtpBps: game.rtpBps, table: game.table, minTargetBps: game.minTargetBps, maxTargetBps: game.maxTargetBps }, platform: { minBet: Number(platform.minBet), exposureBps: platform.exposureBps }, theme: "dark" }); }
      if (m.type === "set_target") onTarget?.(m.data.targetBps);
      if (m.type === "done") onDone?.();
      if (m.type === "status") onStatus?.(m.data.text); };
    window.addEventListener("message", onMsg); return () => window.removeEventListener("message", onMsg);
  }, [game.address]);
  useEffect(() => { if (phase?.step === "oracle") post("bet_placed", { amount: Number(phase.amount ?? 0), targetBps: phase.targetBps ?? 0 }); }, [phase?.step]);
  useEffect(() => { if (result) post("result", { multBps: result.ev.multBps, payout: Number(result.ev.payout), amount: Number(result.ev.amount), r1: String(result.ev.r1), r2: String(result.ev.r2), targetBps: result.ev.targetBps, seedHex: result.seedHex, signature: result.signature }); }, [result]);
  useEffect(() => { post("reset", {}); }, [resetKey]);
  return <iframe ref={ref} src={url} title="game skin" sandbox="allow-scripts allow-same-origin" style={{ width: "100%", height: "100%", minHeight: 560, border: 0, borderRadius: 12, background: "transparent" }} />;
}
