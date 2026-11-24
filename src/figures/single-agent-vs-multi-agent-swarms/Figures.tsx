import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, drawLabel, fillRoundRect } from "../../runtime";
import { Figure, IconButton, Slider, Toggle } from "../../ui";
import {
  computeChainReliability,
  createContextHygiene,
  createHandoffRace,
  getHandoffRaceSnapshot,
  resetContextHygiene,
  restartHandoffRace,
  SINGLE_SEGMENTS,
  SINGLE_TOTAL_SEC,
  stepContextHygiene,
  stepHandoffRace,
  SWARM_SEGMENTS,
  SWARM_TOTAL_SEC,
  TOPOLOGIES,
  type HygieneMode,
  type TopologyKind,
} from "./model";

/* ==========================================================================
   Figure 1: Scaled-Time Handoff Race (4-Agent Swarm vs. Single Warm Loop)
   ========================================================================== */

export function HandoffRaceFigure() {
  const raceRef = useRef(createHandoffRace());

  const replay = () => restartHandoffRace(raceRef.current);

  return (
    <Figure
      caption="Same 4-step coding task on a shared 5x clock. Notice the crimson cold-handoff stalls between separate agents. Click to replay."
      controls={
        <IconButton accent label="Replay handoff race" onClick={replay}>
          <RotateCcw size={14} />
        </IconButton>
      }
    >
      <CanvasStage
        height={162}
        cursor="pointer"
        label="Real-time scaled race showing a 4-agent role swarm stalling at cold handoffs versus a single warm agent loop finishing over twice as fast"
        onPointerDown={replay}
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepHandoffRace(raceRef.current, dt);
          const snap = getHandoffRaceSnapshot(raceRef.current);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const fullW = width - padX * 2;
          const barH = 28;

          // Top lane: 4-agent role swarm (full width = 21.8s)
          const y1 = 36;
          drawLabel(ctx, "4-agent role swarm", padX, y1 - 13, {
            color: theme.copper,
            font: theme.fontSans,
            size: 12,
            weight: 600,
          });
          drawLabel(ctx, `${snap.swarmTokensK}K tokens  |  ${snap.swarmTime.toFixed(1)} s`, width - padX, y1 - 13, {
            color: snap.swarmDone ? theme.copper : theme.muted,
            font: theme.fontSans,
            size: 12,
            weight: snap.swarmDone ? 600 : 500,
            align: "right",
          });

          fillRoundRect(ctx, padX, y1, fullW, barH, 6, theme.bg, theme.line, 1);

          let elapsedCursor = 0;
          for (const seg of SWARM_SEGMENTS) {
            const x = padX + (elapsedCursor / SWARM_TOTAL_SEC) * fullW;
            const segW = (seg.durationSec / SWARM_TOTAL_SEC) * fullW;
            const activeFrac = Math.max(0, Math.min(1, (snap.swarmTime - elapsedCursor) / seg.durationSec));
            if (activeFrac > 0) {
              const fill = seg.kind === "handoff" ? theme.crimson : theme.copper;
              fillRoundRect(ctx, x + 2, y1 + 3, Math.max(2, segW * activeFrac - 3), barH - 6, 4, fill);
            }
            if (segW > 42) {
              drawLabel(ctx, seg.kind === "handoff" ? "cold" : seg.label, x + segW / 2, y1 + barH / 2, {
                color: activeFrac > 0.5 ? theme.bg : theme.dim,
                font: theme.fontSans,
                size: 10,
                weight: 600,
                align: "center",
              });
            }
            elapsedCursor += seg.durationSec;
          }

          // Bottom lane: Single warm loop (proportional width = 10.2 / 21.8 of full width!)
          const y2 = 106;
          const singleTotalW = (SINGLE_TOTAL_SEC / SWARM_TOTAL_SEC) * fullW;

          drawLabel(ctx, "Single warm loop", padX, y2 - 13, {
            color: theme.sage,
            font: theme.fontSans,
            size: 12,
            weight: 600,
          });
          drawLabel(ctx, `${snap.singleTokensK}K tokens  |  ${snap.singleTime.toFixed(1)} s`, width - padX, y2 - 13, {
            color: snap.singleDone ? theme.sage : theme.muted,
            font: theme.fontSans,
            size: 12,
            weight: snap.singleDone ? 600 : 500,
            align: "right",
          });

          fillRoundRect(ctx, padX, y2, fullW, barH, 6, theme.bg, theme.line, 1);

          let singleCursor = 0;
          for (const seg of SINGLE_SEGMENTS) {
            const x = padX + (singleCursor / SWARM_TOTAL_SEC) * fullW;
            const segW = (seg.durationSec / SWARM_TOTAL_SEC) * fullW;
            const activeFrac = Math.max(0, Math.min(1, (snap.singleTime - singleCursor) / seg.durationSec));
            if (activeFrac > 0) {
              fillRoundRect(ctx, x + 2, y2 + 3, Math.max(2, segW * activeFrac - 3), barH - 6, 4, theme.sage);
            }
            if (segW > 34) {
              drawLabel(ctx, seg.label, x + segW / 2, y2 + barH / 2, {
                color: activeFrac > 0.5 ? theme.bg : theme.dim,
                font: theme.fontSans,
                size: 10,
                weight: 600,
                align: "center",
              });
            }
            singleCursor += seg.durationSec;
          }

          if (snap.singleDone) {
            drawLabel(ctx, "Done (2.1x faster)", padX + singleTotalW + 12, y2 + barH / 2, {
              color: theme.sage,
              font: theme.fontSans,
              size: 11.5,
              weight: 600,
            });
          }

          drawLabel(ctx, "0 s", padX, height - 10, { color: theme.dim, font: theme.fontSans, size: 10 });
          drawLabel(ctx, `${SWARM_TOTAL_SEC.toFixed(1)} s`, width - padX, height - 10, {
            color: theme.dim,
            font: theme.fontSans,
            size: 10,
            align: "right",
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Disposable Subagent Context Hygiene (60fps particle flow)
   ========================================================================== */

export function ContextHygieneFigure() {
  const simRef = useRef(createContextHygiene("subagent"));
  const [mode, setMode] = useState<HygieneMode>("subagent");

  const handleMode = (next: HygieneMode) => {
    setMode(next);
    resetContextHygiene(simRef.current, next);
  };

  const replay = () => resetContextHygiene(simRef.current, mode);

  return (
    <Figure
      caption={
        mode === "subagent"
          ? "Disposable subagent absorbs 40K tokens of raw grep noise, hands back a 0.4K summary, and vanishes."
          : "Searching directly in the main loop dumps 40K tokens of raw file noise straight into working memory."
      }
      controls={
        <>
          <Toggle
            label="Search isolation"
            value={mode}
            onChange={handleMode}
            options={[
              { value: "inline", label: "All in main loop" },
              { value: "subagent", label: "Isolated subagent" },
            ]}
          />
          <IconButton accent label="Replay search delegation" onClick={replay}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={176}
        label="Particle flow comparing noisy repo searches flooding the main agent versus an isolated subagent absorbing noise and returning a tiny summary"
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepContextHygiene(sim, dt);
          ctx.clearRect(0, 0, width, height);

          const padX = 24;
          const repoX = padX + 44;
          const repoY = height * 0.5;
          const subX = width * 0.5;
          const subY = height * 0.34;
          const mainX = width - padX - 72;
          const mainY = height * 0.56;

          // Pipes
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 2;
          if (sim.mode === "inline") {
            ctx.beginPath();
            ctx.moveTo(repoX + 36, repoY);
            ctx.lineTo(mainX - 52, mainY);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(repoX + 36, repoY);
            ctx.lineTo(subX - 46, subY);
            ctx.moveTo(subX + 46, subY);
            ctx.lineTo(mainX - 52, mainY);
            ctx.stroke();
          }

          // Animated token chunks
          for (const p of sim.particles) {
            let x = 0;
            let y = 0;
            let color = theme.copper;
            if (p.route === "to_main") {
              x = repoX + 36 + p.x * (mainX - 52 - (repoX + 36));
              y = repoY + p.x * (mainY - repoY);
            } else if (p.route === "to_sub") {
              x = repoX + 36 + p.x * (subX - 46 - (repoX + 36));
              y = repoY + p.x * (subY - repoY);
            } else {
              x = subX + 46 + p.x * (mainX - 52 - (subX + 46));
              y = subY + p.x * (mainY - subY);
              color = theme.sage;
            }
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }

          // Repo node (left)
          fillRoundRect(ctx, repoX - 38, repoY - 26, 76, 52, 9, theme.surfaceSub, theme.lineStrong, 1.25);
          drawLabel(ctx, "Repo", repoX, repoY - 6, { color: theme.ink, font: theme.fontSans, size: 12, weight: 600, align: "center" });
          drawLabel(ctx, "40K logs", repoX, repoY + 11, { color: theme.copper, font: theme.fontSans, size: 10.5, align: "center" });

          // Disposable Subagent node (top-middle, fades away after returning summary!)
          if (sim.subAlive.value > 0.03) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, sim.subAlive.value));
            const sw = 94;
            const sh = 56;
            fillRoundRect(ctx, subX - sw / 2, subY - sh / 2, sw, sh, 10, theme.bg, theme.teal, 1.5);
            const subFill = Math.min(1, sim.subTokensK.value / 45);
            fillRoundRect(ctx, subX - sw / 2 + 6, subY + sh / 2 - 14, (sw - 12) * subFill, 8, 3, theme.copper);
            drawLabel(ctx, "Subagent", subX, subY - 10, { color: theme.teal, font: theme.fontSans, size: 11.5, weight: 600, align: "center" });
            drawLabel(ctx, `${Math.round(sim.subTokensK.value)}K raw`, subX, subY + 4, { color: theme.muted, font: theme.fontSans, size: 10.5, align: "center" });
            ctx.restore();
          } else if (sim.mode === "subagent" && sim.done) {
            drawLabel(ctx, "Subagent discarded", subX, subY, {
              color: theme.dim,
              font: theme.fontSans,
              size: 11,
              align: "center",
            });
          }

          // Main Agent context tank (right)
          const mw = 108;
          const mh = 78;
          const bloated = sim.mainTokensK.value > 22;
          fillRoundRect(ctx, mainX - mw / 2, mainY - mh / 2, mw, mh, 11, theme.bg, bloated ? theme.copper : theme.sage, 1.6);

          // Internal context fill bar rising from bottom
          const fillFrac = Math.min(1, sim.mainTokensK.value / 54);
          const barH = (mh - 14) * fillFrac;
          fillRoundRect(
            ctx,
            mainX - mw / 2 + 7,
            mainY + mh / 2 - 7 - barH,
            mw - 14,
            barH,
            5,
            bloated ? theme.copperBg : theme.sageBg,
          );

          drawLabel(ctx, "Main agent", mainX, mainY - 12, { color: theme.ink, font: theme.fontSans, size: 12, weight: 600, align: "center" });
          drawLabel(ctx, `${sim.mainTokensK.value.toFixed(1)}K tokens`, mainX, mainY + 8, {
            color: bloated ? theme.copper : theme.sage,
            font: theme.fontSans,
            size: 11.5,
            weight: 600,
            align: "center",
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 3: Error Compounding / Telephone Game (Interactive Fidelity Slider)
   ========================================================================== */

export function TelephoneDriftFigure() {
  const [fidelityPct, setFidelityPct] = useState(88);
  const [verified, setVerified] = useState<"chain" | "verifier">("chain");
  const rel = useMemo(() => computeChainReliability(fidelityPct / 100, 5), [fidelityPct]);

  const finalPct = Math.round((verified === "verifier" ? rel.verifiedSurvival : rel.unverifiedSurvival) * 100);

  return (
    <Figure
      caption={
        verified === "chain"
          ? `At ${fidelityPct}% accuracy per handoff, 5 unverified hops drop end-to-end fidelity to ${finalPct}%.`
          : `An isolated fresh-context verifier catches drift missed by the writer, lifting end-to-end fidelity to ${finalPct}%.`
      }
      controls={
        <>
          <Slider
            label="Per-step fidelity"
            min={75}
            max={99}
            step={1}
            value={fidelityPct}
            displayValue={`${fidelityPct}%`}
            onChange={setFidelityPct}
          />
          <Toggle
            label="Verification mode"
            value={verified}
            onChange={setVerified}
            options={[
              { value: "chain", label: "Unverified chain" },
              { value: "verifier", label: "+ Fresh verifier" },
            ]}
          />
        </>
      }
    >
      <CanvasStage
        height={138}
        running={false}
        label="Signal survival curve across 5 agent handoffs showing exponential decay versus recovery with an isolated verifier"
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);

          const padX = 32;
          const steps = verified === "verifier" ? [...rel.stageSurvival, rel.verifiedSurvival] : rel.stageSurvival;
          const labels = verified === "verifier" ? ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5", "Verifier"] : ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"];
          const spanW = width - padX * 2;
          const midY = 66;

          const pts = steps.map((val, i) => ({
            x: padX + (i / (steps.length - 1)) * spanW,
            y: midY + (1 - val) * 34 - 12,
            val,
            label: labels[i],
            isVerifier: verified === "verifier" && i === steps.length - 1,
          }));

          // Connecting signal line
          ctx.beginPath();
          pts.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Nodes sized & colored by surviving signal
          for (const pt of pts) {
            const color = pt.isVerifier ? theme.sage : pt.val < 0.65 ? theme.crimson : pt.val < 0.8 ? theme.copper : theme.teal;
            const bg = pt.isVerifier ? theme.sageBg : pt.val < 0.65 ? theme.crimsonBg : pt.val < 0.8 ? theme.copperBg : theme.tealBg;
            const r = 13 + pt.val * 6;

            ctx.fillStyle = bg;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            drawLabel(ctx, `${Math.round(pt.val * 100)}%`, pt.x, pt.y, {
              color: theme.ink,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
              align: "center",
            });
            drawLabel(ctx, pt.label, pt.x, height - 16, {
              color: pt.isVerifier ? theme.sage : theme.dim,
              font: theme.fontSans,
              size: 10.5,
              weight: pt.isVerifier ? 600 : 500,
              align: "center",
            });
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 4: Topology Tradeoff Sandbox (Single vs. Swarm vs. Dispatcher)
   ========================================================================== */

export function TopologySandboxFigure() {
  const [kind, setKind] = useState<TopologyKind>("dispatcher");
  const spec = TOPOLOGIES[kind];

  return (
    <Figure
      caption={spec.summary}
      controls={
        <Toggle
          label="Agent topology"
          value={kind}
          onChange={setKind}
          options={[
            { value: "single", label: "Single loop" },
            { value: "swarm", label: "Role swarm" },
            { value: "dispatcher", label: "Dispatcher + verifier" },
          ]}
        />
      }
    >
      <CanvasStage
        height={138}
        running={false}
        label="Comparative meters for token cost, wall-clock latency, and context cleanliness across three agent topologies"
        onFrame={({ ctx, width, theme }) => {
          ctx.clearRect(0, 0, width, 138);

          const padX = 24;
          const labelW = 130;
          const valueW = 68;
          const barX = padX + labelW;
          const barW = Math.max(80, width - padX * 2 - labelW - valueW);

          const rows = [
            {
              label: "Token cost",
              ratio: spec.costMultiplier / 3.8,
              val: `${spec.costMultiplier.toFixed(2)}x`,
              color: spec.costMultiplier > 2 ? theme.crimson : spec.costMultiplier > 1.2 ? theme.teal : theme.sage,
            },
            {
              label: "Wall-clock latency",
              ratio: spec.latencyMultiplier / 2.4,
              val: `${spec.latencyMultiplier.toFixed(2)}x`,
              color: spec.latencyMultiplier > 1.6 ? theme.copper : theme.sage,
            },
            {
              label: "Context cleanliness",
              ratio: spec.contextCleanliness / 100,
              val: `${spec.contextCleanliness}%`,
              color: spec.contextCleanliness > 85 ? theme.sage : spec.contextCleanliness > 60 ? theme.teal : theme.copper,
            },
          ];

          rows.forEach((row, i) => {
            const y = 32 + i * 38;
            drawLabel(ctx, row.label, padX, y, {
              color: theme.muted,
              font: theme.fontSans,
              size: 12,
              weight: 500,
            });
            fillRoundRect(ctx, barX, y - 7, barW, 14, 5, theme.bg, theme.line, 1);
            fillRoundRect(ctx, barX + 2, y - 5, Math.max(6, (barW - 4) * row.ratio), 10, 4, row.color);
            drawLabel(ctx, row.val, width - padX, y, {
              color: row.color,
              font: theme.fontSans,
              size: 12.5,
              weight: 600,
              align: "right",
            });
          });
        }}
      />
    </Figure>
  );
}
