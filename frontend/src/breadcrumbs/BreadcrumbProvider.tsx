import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { startCapture, stopCapture, track } from "./breadcrumb-client";

export function BreadcrumbProvider() {
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    startCapture();
    return () => stopCapture();
  }, []);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      const zone = location.pathname.startsWith("/archive")
        ? ("archive" as const)
        : ("live" as const);
      track("page_view", { page: location.pathname }, zone);
      prevPath.current = location.pathname;
    }
  }, [location.pathname]);

  return null;
}
