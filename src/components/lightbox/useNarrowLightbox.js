import { useEffect, useState } from "react";

const LIGHTBOX_NARROW_QUERY = "(max-width: 900px)";

const readQuery = () => (
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(LIGHTBOX_NARROW_QUERY).matches
    : false
);

export default function useNarrowLightbox() {
  const [isNarrow, setIsNarrow] = useState(readQuery);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(LIGHTBOX_NARROW_QUERY);
    const handleChange = (event) => setIsNarrow(event.matches);
    setIsNarrow(query.matches);
    query.addEventListener?.("change", handleChange);
    return () => query.removeEventListener?.("change", handleChange);
  }, []);

  return isNarrow;
}
