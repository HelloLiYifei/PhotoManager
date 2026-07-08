import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function MapView({ onShowPhoto }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [gpsPhotos, setGpsPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    loadGpsPhotos();
  }, []);

  const loadGpsPhotos = async () => {
    try {
      // Get all photos in workspace (search=null, favorite_only=false, deleted_only=false, album_id=null, rating_filter=null, tag_filter=null)
      const allPhotos = await invoke("get_photos", {
        search: null,
        favoriteOnly: false,
        deletedOnly: false,
        albumId: null,
        ratingFilter: null,
        tagFilter: null,
      });

      // Filter photos that have latitude and longitude
      const withGps = allPhotos.filter(
        (p) => p.latitude !== null && p.longitude !== null && p.latitude !== 0 && p.longitude !== 0
      );
      setGpsPhotos(withGps);
    } catch (e) {
      console.error("加载 GPS 照片失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading || gpsPhotos.length === 0) return;

    // Check if Leaflet L is loaded
    if (!window.L) {
      setOffline(true);
      return;
    }

    // Clean up existing map instance
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    try {
      // Find center coordinate (average or default to first photo)
      const first = gpsPhotos[0];
      const center = [first.latitude, first.longitude];

      // Initialize map
      const map = window.L.map(mapRef.current).setView(center, 4);
      mapInstance.current = map;

      // Add dark-mode friendly or standard tiles
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      // Plot markers
      gpsPhotos.forEach((photo) => {
        const marker = window.L.marker([photo.latitude, photo.longitude]).addTo(map);
        
        // Setup popup with details and a placeholder that loads base64 thumbnail
        const popupContent = document.createElement("div");
        popupContent.className = "map-popup-text";
        
        const title = document.createElement("div");
        title.className = "map-popup-title";
        title.innerText = photo.filename;
        popupContent.appendChild(title);

        const coords = document.createElement("div");
        coords.style.opacity = "0.6";
        coords.innerText = `经度: ${photo.longitude.toFixed(4)}, 纬度: ${photo.latitude.toFixed(4)}`;
        popupContent.appendChild(coords);

        const imgPlaceholder = document.createElement("div");
        imgPlaceholder.style.width = "140px";
        imgPlaceholder.style.height = "105px";
        imgPlaceholder.style.background = "#222";
        imgPlaceholder.style.borderRadius = "6px";
        imgPlaceholder.style.display = "flex";
        imgPlaceholder.style.alignItems = "center";
        imgPlaceholder.style.justifyContent = "center";
        imgPlaceholder.style.color = "#666";
        imgPlaceholder.style.fontSize = "11px";
        imgPlaceholder.style.marginTop = "6px";
        imgPlaceholder.innerText = "加载预览中...";
        popupContent.appendChild(imgPlaceholder);

        marker.bindPopup(popupContent);

        // When popup opens, load the thumbnail
        marker.on("popupopen", async () => {
          try {
            const base64 = await invoke("get_photo_thumbnail_base64", { id: photo.id });
            
            const img = document.createElement("img");
            img.src = `data:image/jpeg;base64,${base64}`;
            img.className = "map-popup-img";
            img.onclick = () => {
              if (onShowPhoto) onShowPhoto(photo);
            };

            imgPlaceholder.innerHTML = "";
            imgPlaceholder.style.background = "transparent";
            imgPlaceholder.appendChild(img);
          } catch (err) {
            console.error("加载地图缩略图失败:", err);
            imgPlaceholder.innerText = "加载失败";
          }
        });
      });
    } catch (err) {
      console.error("初始化地图失败:", err);
      setOffline(true);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [loading, gpsPhotos]);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner"></div>
        <div style={{ marginTop: "12px" }}>正在读取 GPS 元数据...</div>
      </div>
    );
  }

  if (gpsPhotos.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🌍</div>
        <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)" }}>
          暂无 GPS 定位照片
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "8px", maxWidth: "400px" }}>
          没有在当前工作空间中发现包含经纬度元数据的照片。您可以导入含有 GPS 信息的手机照片或相机照片。
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrapper animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>🌍 照片地图轨迹</h2>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
            共在地图中标绘出 {gpsPhotos.length} 张带地理坐标的照片。点击标记可预览照片。
          </p>
        </div>
      </div>

      {offline ? (
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, gap: "16px" }}>
          <div style={{ padding: "12px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", fontSize: "13px", color: "#FCA5A5" }}>
            ⚠️ <strong>离线模式</strong>：无法从网络加载地图图层，已为您列出带地理坐标的照片轨迹。
          </div>
          <div className="masonry-grid" style={{ overflowY: "auto", flexGrow: 1 }}>
            {gpsPhotos.map((photo) => (
              <GpsOfflineCard key={photo.id} photo={photo} onShowPhoto={onShowPhoto} />
            ))}
          </div>
        </div>
      ) : (
        <div ref={mapRef} className="map-container" />
      )}
    </div>
  );
}

function GpsOfflineCard({ photo, onShowPhoto }) {
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    invoke("get_photo_thumbnail_base64", { id: photo.id })
      .then((b64) => setThumb(b64))
      .catch((e) => console.error(e));
  }, [photo.id]);

  return (
    <div className="masonry-item" onClick={() => onShowPhoto(photo)}>
      {thumb ? (
        <img src={`data:image/jpeg;base64,${thumb}`} alt={photo.filename} />
      ) : (
        <div style={{ height: "150px", background: "#222", borderRadius: "6px" }} />
      )}
      <div style={{ padding: "12px", fontSize: "12px" }}>
        <div style={{ fontWeight: "600", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {photo.filename}
        </div>
        <div style={{ opacity: 0.6, fontSize: "11px" }}>
          📍 纬度: {photo.latitude.toFixed(4)}<br />
          📍 经度: {photo.longitude.toFixed(4)}
        </div>
      </div>
    </div>
  );
}
