/*! Wagerino Skin SDK v0.1 — a game front-end ("skin") that runs inside the Wagerino host.
 *  The host owns wallet, session, bets, settlement and proofs. The skin only renders.
 *  Include this file, then:
 *    WagerinoSkin.on("init", ({ game, platform, theme }) => { ... })   // game: name, mode, table rows [{multBps, prob}], rtpBps, min/maxTargetBps
 *    WagerinoSkin.on("bet_placed", ({ amount, targetBps }) => { ... })  // start suspense
 *    WagerinoSkin.on("result", ({ multBps, payout, amount, r2, seedHex, targetBps }) => { ... }) // play theatre, then WagerinoSkin.done()
 *    WagerinoSkin.on("reset", () => { ... })
 *    WagerinoSkin.setTarget(targetBps)   // target-mode games: tell the host what the player chose
 *    WagerinoSkin.done()                 // theatre finished — host reveals chips/feed/balance (player-paced games)
 *    WagerinoSkin.ready({ playerPaced: true|false })   // call once on load
 */
(function () {
  const handlers = {}; let hostOrigin = "*";
  window.addEventListener("message", (e) => { const m = e.data; if (!m || m.wagerino !== 1) return; if (e.origin) hostOrigin = e.origin; (handlers[m.type] || []).forEach((fn) => { try { fn(m.data); } catch (err) { console.error("skin handler", err); } }); });
  const send = (type, data) => window.parent.postMessage({ wagerino: 1, type, data }, hostOrigin);
  window.WagerinoSkin = {
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return this; },
    ready(opts) { send("ready", opts || {}); },
    setTarget(targetBps) { send("set_target", { targetBps }); },
    setStatus(text) { send("status", { text }); },
    done() { send("done", {}); },
    /** Deterministic PRNG from r2 for cosmetic randomness (which reel symbol, where the ball bounces). */
    prng(r2) { let x = Number(BigInt(r2) % 2147483647n) || 1; return () => (x = (x * 48271) % 2147483647) / 2147483647; },
  };
})();
