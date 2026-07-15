import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { MapPinned, TriangleAlert } from "lucide-react";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { ensureLeafletMarkerCluster } from "../lib/loadLeafletMarkerCluster";
import { useI18n } from "../i18n";
import { Button, EmptyState, Spinner } from "./ui";
import MapStatusBanner from "./map/MapStatusBanner";
import { groupPhotosByLocation } from "./map/mapPhotoUtils";
import useMapPhotos from "./map/useMapPhotos";
import styles from "./MapView.module.css";

const DEFAULT_ZOOM = 13;
const FOCUSED_ZOOM = 15;

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function thumbnailMarkup(src) {
  return src
    ? `<img src="${escapeAttribute(src)}" alt="" draggable="false" />`
    : `<span class="${styles.markerThumbnailPlaceholder}" aria-hidden="true"></span>`;
}

function createMarkerIcon(count, focused, thumbnailSrc = "") {
  const markerClassName = [styles.marker, focused ? styles.markerFocused : ""]
    .filter(Boolean)
    .join(" ");

  return L.divIcon({
    className: styles.markerShell,
    html: `<span class="${styles.markerVisual}"><span class="${styles.markerThumbnail}">${thumbnailMarkup(thumbnailSrc)}</span><span class="${markerClassName}"><span class="${styles.markerDot}"></span>${
      count > 1 ? `<span class="${styles.markerCount}">${count}</span>` : ""
    }</span></span>`,
    iconSize: [82, 94],
    iconAnchor: [41, 92],
  });
}

function createClusterIcon(cluster) {
  const childMarkers = cluster.getAllChildMarkers();
  const photoCount = childMarkers
    .reduce((total, marker) => total + (marker.options.photoCount || 1), 0);
  const thumbnailSrc = childMarkers.find((marker) => marker.options.thumbnailSrc)
    ?.options.thumbnailSrc;

  return L.divIcon({
    className: styles.clusterShell,
    html: `<span class="${styles.clusterVisual}"><span class="${styles.markerThumbnail}">${thumbnailMarkup(thumbnailSrc)}</span><span class="${styles.clusterMarker}"><span class="${styles.clusterCount}">${photoCount}</span></span></span>`,
    iconSize: [82, 102],
    iconAnchor: [41, 98],
  });
}

function temporaryAlbumFromCluster(cluster) {
  const coordinates = cluster.getLatLng();
  const photoIds = new Set();

  cluster.getAllChildMarkers().forEach((marker) => {
    marker.options.photoGroup?.photos.forEach((photo) => {
      photoIds.add(photo.id);
    });
  });

  return {
    photoIds: [...photoIds],
    latitude: coordinates.lat,
    longitude: coordinates.lng,
  };
}

export default function MapView({ onOpenTemporaryAlbum, focusedPhotoId = null }) {
  const { t, formatNumber } = useI18n();
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerClusterRef = useRef(null);
  const markerGroupsRef = useRef([]);
  const markersByPhotoIdRef = useRef(new Map());
  const onOpenTemporaryAlbumRef = useRef(onOpenTemporaryAlbum);
  const focusedPhotoIdRef = useRef(focusedPhotoId);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [clusterPluginReady, setClusterPluginReady] = useState(
    () => typeof L.markerClusterGroup === "function",
  );
  const { photos: gpsPhotos, loading, error, reload } = useMapPhotos();

  onOpenTemporaryAlbumRef.current = onOpenTemporaryAlbum;
  focusedPhotoIdRef.current = focusedPhotoId;

  const locationGroups = useMemo(
    () => groupPhotosByLocation(gpsPhotos),
    [gpsPhotos],
  );

  useEffect(() => {
    if (clusterPluginReady) return undefined;
    let active = true;

    ensureLeafletMarkerCluster()
      .catch((pluginError) => {
        console.error("Unable to load map clustering:", pluginError);
        return false;
      })
      .finally(() => {
        if (active) setClusterPluginReady(true);
      });

    return () => {
      active = false;
    };
  }, [clusterPluginReady]);

  useEffect(() => {
    if (
      loading ||
      !clusterPluginReady ||
      error ||
      gpsPhotos.length === 0 ||
      !mapElementRef.current
    ) {
      return undefined;
    }

    setTilesUnavailable(false);
    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      preferCanvas: true,
    });
    mapRef.current = map;
    let disposed = false;
    markerGroupsRef.current = [];
    markersByPhotoIdRef.current = new Map();

    const markerCluster = typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({
          maxClusterRadius: 68,
          disableClusteringAtZoom: 18,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: false,
          spiderfyOnMaxZoom: false,
          removeOutsideVisibleBounds: true,
          chunkedLoading: true,
          iconCreateFunction: createClusterIcon,
        })
      : L.layerGroup();
    markerClusterRef.current = markerCluster;

    markerCluster.on?.("clusterclick", (event) => {
      const album = temporaryAlbumFromCluster(event.layer);
      if (album.photoIds.length > 0) {
        onOpenTemporaryAlbumRef.current?.(album);
      }
    });

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
        photoCount: group.photos.length,
        photoGroup: group,
        thumbnailSrc: "",
        title: group.photos.length > 1
          ? t("common.photoCount", { count: formatNumber(group.photos.length) })
          : group.photos[0].filename,
        alt: group.photos.length > 1
          ? t("map.photoCountLocation", { count: formatNumber(group.photos.length) })
          : group.photos[0].filename,
      }).addTo(markerCluster);

      marker.on("click", () => {
        onOpenTemporaryAlbumRef.current?.({
          photoIds: group.photos.map((photo) => photo.id),
          latitude: group.latitude,
          longitude: group.longitude,
        });
      });

      loadPhotoThumbnail(group.photos[0].id, 2)
        .then((thumbnailSrc) => {
          if (disposed) return;
          marker.options.thumbnailSrc = thumbnailSrc;
          const isFocused = group.photos.some(
            (photo) => photo.id === focusedPhotoIdRef.current,
          );
          marker.setIcon(createMarkerIcon(group.photos.length, isFocused, thumbnailSrc));
          markerCluster.refreshClusters?.(marker);
        })
        .catch(() => {});

      markerGroupsRef.current.push({ marker, group });
      group.photos.forEach((photo) => {
        markersByPhotoIdRef.current.set(photo.id, marker);
      });
      bounds.extend([group.latitude, group.longitude]);
    });

    markerCluster.addTo(map);

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
      disposed = true;
      cancelAnimationFrame(animationFrame);
      markerGroupsRef.current = [];
      markersByPhotoIdRef.current.clear();
      markerClusterRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [clusterPluginReady, error, formatNumber, gpsPhotos, loading, locationGroups, t]);

  useEffect(() => {
    if (!mapRef.current) return;

    markerGroupsRef.current.forEach(({ marker, group }) => {
      const containsFocus = group.photos.some(
        (photo) => photo.id === focusedPhotoId,
      );
      marker.setIcon(createMarkerIcon(
        group.photos.length,
        containsFocus,
        marker.options.thumbnailSrc,
      ));
    });

    const focusedMarker = markersByPhotoIdRef.current.get(focusedPhotoId);
    if (!focusedMarker) return;

    const map = mapRef.current;
    const markerCluster = markerClusterRef.current;
    map.setView(focusedMarker.getLatLng(), FOCUSED_ZOOM);

    if (typeof markerCluster?.zoomToShowLayer === "function") {
      markerCluster.refreshClusters?.();
      markerCluster.zoomToShowLayer(focusedMarker, () => {
        if (mapRef.current === map) {
          focusedMarker.setIcon(createMarkerIcon(
            focusedMarker.options.photoCount,
            true,
            focusedMarker.options.thumbnailSrc,
          ));
        }
      });
    }
  }, [focusedPhotoId, gpsPhotos]);

  if (loading || !clusterPluginReady) {
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
