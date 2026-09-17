import { useEffect, useState } from "react";

function roomIdFromPath() {
  const match = window.location.pathname.match(/^\/room\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useRouter() {
  const [route, setRoute] = useState({
    path: window.location.pathname,
    initialName: "",
  });

  useEffect(() => {
    const refresh = () =>
      setRoute({ path: window.location.pathname, initialName: "" });
    window.addEventListener("popstate", refresh);
    return () => window.removeEventListener("popstate", refresh);
  }, []);

  const navigate = (path, initialName = "") => {
    window.history.pushState({}, "", path);
    setRoute({ path, initialName });
  };

  return { roomId: roomIdFromPath(), initialName: route.initialName, navigate };
}
