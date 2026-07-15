import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinned, TriangleAlert } from "lucide-react";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { useI18n } from "../i18n";
import { Button, EmptyState, Spinner } from "./ui";
import createPhotoPopup from "./map/createPhotoPopup";
import MapStatusBanner from "./map/MapStatusBanner";
import { groupPhotosByLocation } from "./map/mapPhotoUtils";
import useMapPhotos from "./map/useMapPhotos";
import styles from "./MapView.module.css";

const DEFAULT_ZOOM = 13;
const FOCUSED_ZOOM = 15;

function createMarkerIcon(count, focused) {
  const markerClassName = [styles.marker, focused ? styles.markerFocused : ""]
    .filter(Boolean)
    .join(" ");

  return L.divIcon({
    className: styles.markerShell,
    html: `<span class="${markerClassName}"><span class="${styles.markerDot}"></span>${
      count > 1 ? `<span class="${styles.markerCount}">${count}</span>` : ""
    }</span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
  });
}

export default function MapView({ onShowPhoto, focusedPhotoId = null }) {
  const { t, formatNumber } = useI18n();
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerGroupsRef = useRef([]);
  const markersByPhotoIdRef = useRef(new Map());
  const onShowPhotoRef = useRef(onShowPhoto);
  const focusedPhotoIdRef = useRef(focusedPhotoId);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const { photos: gpsPhotos, loading, error, reload } = useMapPhotos();

  onShowPhotoRef.current = onShowPhoto;
  focusedPhotoIdRef.current = focusedPhotoId;

  const locationGroups = useMemo(
    () => groupPhotosByLocation(gpsPhotos),
    [gpsPhotos],
  );

  useEffect(() => {
    if (loading || error || gpsPhotos.length === 0 || !mapElementRef.current) {
      return undefined;
    }

    setTilesUnavailable(false);
    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      preferCanvas: true,
    });
    mapRef.current = map;
    markerGroupsRef.current = [];
    markersByPhotoIdRef.current = new Map();

    let tileErrorCount = 0;
    const tiles = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      },
    );
    tiles.on("tileerror", () => {
      tileErrorCount += 1;
      if (tileErrorCount >= 3) setTilesUnavailable(true);
    });
    tiles.addTo(map);

    const bounds = L.latLngBounds([]);
    locationGroups.forEach((group) => {
      const containsFocus = group.photos.some(
        (photo) => photo.id === focusedPhotoIdRef.current,
      );
      const marker = L.marker([group.latitude, group.longitude], {
        icon: createMarkerIcon(group.photos.length, containsFocus),
        title: group.photos.length > 1
          ? t("common.photoCount", { count: formatNumber(group.photos.length) })
          : group.photos[0].filename,
        alt: group.photos.length > 1
          ? t("map.photoCountLocation", { count: formatNumber(group.photos.length) })
          : group.photos[0].filename,
      }).addTo(map);

      const popup = createPhotoPopup({
        group,
        onShowPhoto: (photo) => onShowPhotoRef.current?.(photo),
        loadThumbnail: loadPhotoThumbnail,
        styles,
      });
      let popupLoaded = false;
      marker.bindPopup(popup.root, { maxWidth: 360, minWidth: 180 });
      marker.on("popupopen", () => {
        if (popupLoaded) return;
        popupLoaded = true;
        popup.loadThumbnails();
      });

      markerGroupsRef.current.push({ marker, group });
      group.photos.forEach((photo) => {
        markersByPhotoIdRef.current.set(photo.id, marker);
      });
      bounds.extend([group.latitude, group.longitude]);
    });

    if (gpsPhotos.length === 1) {
      map.setView(
        [gpsPhotos[0].latitude, gpsPhotos[0].longitude],
        DEFAULT_ZOOM,
      );
    } else {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: DEFAULT_ZOOM });
    }

    const animationFrame = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(animationFrame);
      markerGroupsRef.current = [];
      markersByPhotoIdRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [error, formatNumber, gpsPhotos, loading, locationGroups, t]);

  useEffect(() => {
    if (!mapRef.current) return;

    markerGroupsRef.current.forEach(({ marker, group }) => {
      const containsFocus = group.photos.some(
        (photo) => photo.id === focusedPhotoId,
      );
      marker.setIcon(createMarkerIcon(group.photos.length, containsFocus));
    });

    const focusedMarker = markersByPhotoIdRef.current.get(focusedPhotoId);
    if (!focusedMarker) return;

    mapRef.current.setView(focusedMarker.getLatLng(), FOCUSED_ZOOM);
    focusedMarker.openPopup();
  }, [focusedPhotoId, gpsPhotos]);

  if (loading) {
    return (
      <div className={styles.centeredState}>
        <Spinner label={t("map.loading")} showLabel />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centeredState}>
        <EmptyState
          icon={<TriangleAlert aria-hidden="true" />}
          title={t("map.loadFailed")}
          description={error}
          action={<Button onClick={reload}>{t("common.retry")}</Button>}
        />
      </div>
    );
  }

  if (gpsPhotos.length === 0) {
    return (
      <div className={styles.centeredState}>
        <EmptyState
          icon={<MapPinned aria-hidden="true" />}
          title={t("map.empty")}
          description={t("map.emptyDescription")}
        />
      </div>
    );
  }

  return (
    <section className={styles.page} aria-label={t("map.label")}>
      <p className={styles.summary} role="status">
        {t("map.summary", { photos: formatNumber(gpsPhotos.length), locations: formatNumber(locationGroups.length) })}
      </p>
      {tilesUnavailable && <MapStatusBanner />}
      <div
        ref={mapElementRef}
        className={styles.map}
        aria-label={t("map.mapLabel")}
      />
    </section>
  );
}
