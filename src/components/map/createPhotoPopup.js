export default function createPhotoPopup({
  group,
  onShowPhoto,
  loadThumbnail,
  styles,
}) {
  const root = document.createElement("div");
  root.className = styles.popup;

  const title = document.createElement("div");
  title.className = styles.popupTitle;
  title.textContent = group.photos.length > 1
    ? `此位置有 ${group.photos.length} 张照片`
    : group.photos[0].filename;
  root.appendChild(title);

  const coordinates = document.createElement("div");
  coordinates.className = styles.popupCoordinates;
  coordinates.textContent = `${group.latitude.toFixed(5)}, ${group.longitude.toFixed(5)}`;
  root.appendChild(coordinates);

  const gallery = document.createElement("div");
  gallery.className = styles.popupGallery;
  root.appendChild(gallery);

  const thumbnails = group.photos.map((photo) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = styles.popupPhoto;
    button.title = `查看 ${photo.filename}`;
    button.setAttribute("aria-label", `查看照片 ${photo.filename}`);
    button.addEventListener("click", () => onShowPhoto?.(photo));

    const placeholder = document.createElement("span");
    placeholder.className = styles.popupPlaceholder;
    placeholder.textContent = "加载预览…";
    button.appendChild(placeholder);

    const name = document.createElement("span");
    name.className = styles.popupFilename;
    name.textContent = photo.filename;
    button.appendChild(name);
    gallery.appendChild(button);

    return { photo, button, placeholder };
  });

  const loadThumbnails = () => {
    thumbnails.forEach(({ photo, button, placeholder }) => {
      loadThumbnail(photo.id, 2)
        .then((src) => {
          const image = document.createElement("img");
          image.src = src;
          image.alt = photo.filename;
          image.className = styles.popupImage;
          placeholder.replaceWith(image);
          button.classList.add(styles.popupPhotoLoaded);
        })
        .catch(() => {
          placeholder.textContent = "预览不可用";
        });
    });
  };

  return { root, loadThumbnails };
}
