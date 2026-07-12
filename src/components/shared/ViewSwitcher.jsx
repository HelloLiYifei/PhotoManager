import { GalleryHorizontal, Grid3X3, List } from "lucide-react";
import styles from "./ViewSwitcher.module.css";

export const DEFAULT_VIEW_OPTIONS = Object.freeze([
  { value: "masonry", label: "瀑布流", Icon: Grid3X3 },
  { value: "list", label: "列表", Icon: List },
  { value: "gallery", label: "画廊", Icon: GalleryHorizontal },
]);

export default function ViewSwitcher({
  value = "masonry",
  onChange,
  options = DEFAULT_VIEW_OPTIONS,
  ariaLabel = "照片视图",
  className = "",
}) {
  return (
    <div
      className={`${styles.switcher} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map(({ value: optionValue, label, Icon }) => (
        <button
          type="button"
          key={optionValue}
          className={value === optionValue ? styles.active : undefined}
          onClick={() => onChange?.(optionValue)}
          title={`${label}视图`}
          aria-label={`${label}视图`}
          aria-pressed={value === optionValue}
        >
          {Icon ? <Icon aria-hidden="true" /> : null}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
