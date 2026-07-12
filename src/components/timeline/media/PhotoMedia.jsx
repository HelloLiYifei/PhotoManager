import { useEffect, useRef, useState } from "react";
import { loadPhotoThumbnail } from "../../../lib/thumbnailLoader";
import { loadPhotoPreview } from "../../../lib/previewLoader";

export function ThumbnailImage({ id, alt, scrollRoot, fit = "natural" }) {
  return (
    <LazyThumbnail
      sourceKey={`photo:${id}`}
      load={(priority) => loadPhotoThumbnail(id, priority)}
      alt={alt}
      scrollRoot={scrollRoot}
      fit={fit}
      className="photo-thumbnail"
      loadingClassName="photo-card-img"
    />
  );
}

export function LazyThumbnail({
  load,
  alt = "",
  sourceKey = alt,
  scrollRoot,
  fit = "natural",
  className = "",
  loadingClassName = className,
  onLoad,
}) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const imageRef = useRef(null);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let active = true;
    let observer;

    setSrc("");
    setLoading(true);

    const load = async (priority = 0) => {
      try {
        const imageUrl = await loadRef.current(priority);
        if (active) setSrc(imageUrl);
      } catch {
        // The fallback is rendered below. A broken thumbnail should not make
        // the surrounding photo browser unusable.
      } finally {
        if (active) setLoading(false);
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
    } else {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;

          const rootCenter = entry.rootBounds
            ? (entry.rootBounds.top + entry.rootBounds.bottom) / 2
            : window.innerHeight / 2;
          const cardCenter =
            (entry.boundingClientRect.top + entry.boundingClientRect.bottom) / 2;
          load(10_000 - Math.abs(cardCenter - rootCenter));
          observer.disconnect();
        },
        {
          root: scrollRoot?.current || null,
          rootMargin: "450px 0px",
          threshold: 0.01,
        },
      );

      if (imageRef.current) observer.observe(imageRef.current);
    }

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [scrollRoot, sourceKey]);

  const fitClassName = `thumbnail-${fit}`;

  if (loading) {
    return (
      <div
        ref={imageRef}
        className={`${loadingClassName} ${fitClassName}`.trim()}
        role="status"
        aria-label={`正在加载${alt || "照片"}`}
      />
    );
  }

  return (
    <img
      ref={imageRef}
      src={src || "/placeholder.svg"}
      alt={alt}
      className={`${className} ${fitClassName}`.trim()}
      loading="lazy"
      decoding="async"
      data-fit={fit}
      onLoad={onLoad}
    />
  );
}

export function GalleryPreviewImage({ id, alt }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    setSrc("");

    loadPhotoPreview(id)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc("/placeholder.svg");
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (!src) {
    return (
      <div className="gallery-preview-loading" role="status" aria-label="正在读取预览图">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <img
      src={src}
      className="gallery-preview-image"
      alt={alt}
      decoding="async"
    />
  );
}

export function ComparePreviewImage({ id, alt = "对比锁定图" }) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setSrc("");
    setLoading(true);

    loadPhotoPreview(id)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc("/placeholder.svg");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div role="status" aria-label="正在读取高清对比图">
        正在读取高清对比图…
      </div>
    );
  }

  return (
    <img
      src={src}
      className="compare-locked-img"
      alt={alt}
      decoding="async"
    />
  );
}
