import type { ReactNode, RefObject } from "react";

export function LabStage({
  kicker = "Interactive",
  title,
  metrics,
  controls,
  caption,
  stageRef,
  children,
}: {
  kicker?: string;
  title: string;
  metrics?: ReactNode;
  controls?: ReactNode;
  caption?: ReactNode;
  stageRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <figure className="lab-breakout" ref={stageRef}>
      <div className="lab-stage">
        <div className="lab-header">
          <div className="lab-header-left">
            <span className="lab-kicker">{kicker}</span>
            <h4 className="lab-title">{title}</h4>
          </div>
          {metrics ? <div className="lab-metrics">{metrics}</div> : null}
        </div>
        <div className="lab-canvas-wrap">{children}</div>
        {controls ? <div className="lab-controls">{controls}</div> : null}
        {caption ? <figcaption className="lab-caption">{caption}</figcaption> : null}
      </div>
    </figure>
  );
}
