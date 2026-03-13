import type React from "react";

export interface IconProps {
  name: string;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}

export const Icon: React.FC<IconProps> = ({ name, style, className, title }) => (
  <i
    className={`codicon codicon-${name} ${className || ""}`}
    style={style}
    title={title}
  />
);
