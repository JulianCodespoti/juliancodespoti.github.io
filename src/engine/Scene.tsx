import type { ReactNode, RefObject } from "react";

export function Scene({
  title,
  controls,
  footer,
  sceneRef,
  children,
}: {
  title?: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  sceneRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <figure className="scene-frame" ref={sceneRef}>
      {(title || controls) && (
        <div className="scene-bar">
          <div className="scene-label">{title}</div>
          {controls ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.45rem" }}>{controls}</div> : null}
        </div>
      )}
      <div className="scene-stage">{children}</div>
      {footer ? <figcaption className="scene-foot">{footer}</figcaption> : null}
    </figure>
  );
}
