import type { ReactNode, RefObject } from "react";

export function Diagram({
  top,
  footer,
  boxRef,
  children,
}: {
  top?: ReactNode;
  footer?: ReactNode;
  boxRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div className="diagram-box" ref={boxRef}>
      {top ? <div className="diagram-top">{top}</div> : null}
      <div className="diagram-body">{children}</div>
      {footer ? <div className="diagram-footer">{footer}</div> : null}
    </div>
  );
}
