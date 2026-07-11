import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";

const DEFAULT_ZOOM = 13;

function hasValidCoordinates(photo) {
  return (
    Number.isFinite(photo.latitude) &&
    Number.isFinite(photo.longitude) &&
    photo.latitude >= -90 &&
    photo.latitude <= 90 &&
    photo.longitude >= -180 &&
    photo.longitude <= 180
  );
}

function groupPhotosByLocation(photos) {
  const groups = new Map();

  photos.forEach((photo) => {
    // Six decimal places keeps genuinely identical capture positions together
    // while retaining roughly decimetre-level coordinate precision.
    const key = `${photo.latitude.toFixed(6)},${photo.longitude.toFixed(6)}`;
    const group = groups.get(key);
    if (group) {
      group.photos.push(photo);
    } else {
      groups.set(key, {
        latitude: photo.latitude,
        longitude: photo.longitude,
        photos: [photo],
      });
    }
  });

  return [...groups.values()];
}

function createMarkerIcon(count, focused) {
  return L.divIcon({
    className: "photo-map-marker-shell",
    html: `<span class="photo-map-marker${focused ? " is-focused" : ""}"><span class="photo-map-marker-dot"></span>${count > 1 ? `<span class="photo-map-marker-count">${count}</span>` : ""}</span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
  });
}

function createPopup(group, onShowPhoto) {
  const root = document.createElement("div");
  root.className = "map-popup-text";

  const title = document.createElement("div");
  title.className = "map-popup-title";
  title.textContent = group.photos.length > 1
    ? `此位置有 ${group.photos.length} 张照片`
    : group.photos[0].filename;
  root.appendChild(title);

  const coords = document.createElement("div");
  coords.className = "map-popup-coordinates";
  coords.textContent = `${group.latitude.toFixed(5)}, ${group.longitude.toFixed(5)}`;
  root.appendChild(coords);

  const gallery = document.createElement("div");
  gallery.className = "map-popup-gallery";
  root.appendChild(gallery);

  const thumbnails = group.photos.map((photo) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-popup-photo";
    button.title = `查看 ${photo.filename}`;
    button.addEventListener("click", () => onShowPhoto?.(photo));

    const placeholder = document.createElement("span");
    placeholder.className = "map-popup-placeholder";
    placeholder.textContent = "加载预览…";
    button.appendChild(placeholder);

    const name = document.createElement("span");
    name.className = "map-popup-filename";
    name.textContent = photo.filename;
    button.appendChild(name);
    gallery.appendChild(button);

    return { photo, button, placeholder };
  });

  return { root, thumbnails, loaded: false };
}

export default function MapView({ onShowPhoto, focusedPhotoId = null }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersByPhotoIdRef = useRef(new Map());
  const onShowPhotoRef = useRef(onShowPhoto);
  const [gpsPhotos, setGpsPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tilesUnavailable, setTilesUnavailable] = useState(false);

  onShowPhotoRef.current = onShowPhoto;

  useEffect(() => {
    let active = true;

    invoke("get_photos", {
      search: null,
      favoriteOnly: false,
      deletedOnly: false,
      albumId: null,
      ratingFilter: null,
      tagFilter: null,
    })
      .then((photos) => {
        if (active) setGpsPhotos(photos.filter(hasValidCoordinates));
      })
      .catch((error) => {
        console.error("加载 GPS 照片失败:", error);
        if (active) setLoadError(String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const locationGroups = useMemo(() => groupPhotosByLocation(gpsPhotos), [gpsPhotos]);

  useEffect(() => {
    if (loading || loadError || gpsPhotos.length === 0 || !mapElementRef.current) return undefined;

    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      preferCanvas: true,
    });
    mapRef.current = map;
    markersByPhotoIdRef.current = new Map();

    let tileErrorCount = 0;
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
    tiles.on("tileerror", () => {
      tileErrorCount += 1;
      if (tileErrorCount === 3) setTilesUnavailable(true);
    });
    tiles.addTo(map);

    const bounds = L.latLngBounds([]);
    locationGroups.forEach((group) => {
      const containsFocus = group.photos.some((photo) => photo.id === focusedPhotoId);
      const marker = L.marker([group.latitude, group.longitude], {
        icon: createMarkerIcon(group.photos.length, containsFocus),
        title: group.photos.length > 1 ? `${group.photos.length} 张照片` : group.photos[0].filename,
        alt: group.photos.length > 1 ? `${group.photos.length} 张照片的位置` : group.photos[0].filename,
      }).addTo(map);

      const popup = createPopup(group, (photo) => onShowPhotoRef.current?.(photo));
      marker.bindPopup(popup.root, { maxWidth: 360, minWidth: 180 });
      marker.on("popupopen", () => {
        if (popup.loaded) return;
        popup.loaded = true;

        popup.thumbnails.forEach(({ photo, button, placeholder }) => {
          loadPhotoThumbnail(photo.id, 2)
            .then((src) => {
              const image = document.createElement("img");
              image.src = src;
              image.alt = photo.filename;
              image.className = "map-popup-img";
              placeholder.replaceWith(image);
              button.classList.add("is-loaded");
            })
            .catch(() => {
              placeholder.textContent = "预览不可用";
            });
        });
      });

      group.photos.forEach((photo) => markersByPhotoIdRef.current.set(photo.id, marker));
      bounds.extend([group.latitude, group.longitude]);
    });

    if (focusedPhotoId && markersByPhotoIdRef.current.has(focusedPhotoId)) {
      const marker = markersByPhotoIdRef.current.get(focusedPhotoId);
      map.setView(marker.getLatLng(), 15);
      marker.openPopup();
    } else if (gpsPhotos.length === 1) {
      map.setView([gpsPhotos[0].latitude, gpsPhotos[0].longitude], DEFAULT_ZOOM);
    } else {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: DEFAULT_ZOOM });
    }

    // The map lives inside a flex layout; wait for layout before measuring tiles.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      markersByPhotoIdRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [focusedPhotoId, gpsPhotos, loadError, loading, locationGroups]);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner" />
        <div style={{ marginTop: "12px" }}>正在读取 GPS 元数据…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="empty-state">
        <div className="map-empty-icon">!</div>
        <div className="map-empty-title">无法加载照片位置</div>
        <div className="map-empty-description">{loadError}</div>
      </div>
    );
  }

  if (gpsPhotos.length === 0) {
    return (
      <div className="empty-state">
        <div className="map-empty-icon">⌖</div>
        <div className="map-empty-title">暂无带位置信息的照片</div>
        <div className="map-empty-description">
          导入包含 GPS 经纬度的手机或相机照片后，它们会自动显示在地图上。
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrapper animate-fade-in">
      <div className="map-header">
        <div>
          <h2>照片地图</h2>
          <p>{gpsPhotos.length} 张照片，分布在 {locationGroups.length} 个位置。点击标记可查看照片。</p>
        </div>
      </div>

      {tilesUnavailable && (
        <div className="map-network-warning" role="status">
          地图底图暂时无法连接；照片位置标记仍可使用。
        </div>
      )}
      <div ref={mapElementRef} className="map-container" aria-label="照片位置地图" />
    </div>
  );
}
