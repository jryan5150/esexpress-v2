import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { track } from "./breadcrumb-client";
import type { BreadcrumbZone } from "../types/api";

function inferZone(pathname: string): BreadcrumbZone {
  if (pathname.startsWith("/archive")) return "archive";
  return "live";
}

export function useBreadcrumb() {
  const location = useLocation();

  const trackEvent = useCallback(
    (
      eventType: string,
      eventData: Record<string, unknown> = {},
      zone?: BreadcrumbZone,
    ) => {
      track(eventType, eventData, zone ?? inferZone(location.pathname));
    },
    [location.pathname],
  );

  return { track: trackEvent };
}
