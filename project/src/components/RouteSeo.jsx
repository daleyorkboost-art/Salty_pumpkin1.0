import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function RouteSeo() {
  const location = useLocation();

  useEffect(() => {
    const privateRoute = /^\/(login|auth(?:\/|$)|account(?:\/|$)|user(?:\/|$))/.test(location.pathname);
    let robots = document.querySelector('meta[name="robots"]');
    if (privateRoute) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, nofollow";
    } else if (robots) {
      robots.remove();
    }
  }, [location.pathname]);

  return null;
}
