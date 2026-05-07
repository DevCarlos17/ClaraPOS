import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { PWAInstallBanner } from "@/components/pwa/pwa-install-banner";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster position="top-right" richColors duration={1500} />
      <PWAInstallBanner />
    </>
  );
}
