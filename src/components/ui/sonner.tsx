import {
  CheckCircle,
  Info,
  CircleNotch,
  XCircle,
  Warning,
} from "@phosphor-icons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CheckCircle className="size-4 text-green-500" />,
        info: <Info className="size-4 text-blue-500" />,
        warning: <Warning className="size-4 text-yellow-500" />,
        error: <XCircle className="size-4 text-red-500" />,
        loading: <CircleNotch className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "14px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
