import { GalleryHorizontal, Grid3X3, List } from "lucide-react";
import { useI18n } from "../../i18n";
import { viewSwitcherStyles as styles } from "../../themes/classNames";

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
  const { t } = useI18n();
  const resolvedAriaLabel = ariaLabel === "照片视图" ? t("timeline.photoView") : ariaLabel;
  return (
    <div
      className={`${styles.switcher} ${className}`.trim()}
      role="group"
      aria-label={resolvedAriaLabel}
    >
      {options.map(({ value: optionValue, label, Icon }) => {
        const resolvedLabel = options === DEFAULT_VIEW_OPTIONS
          ? t(`settings.view.${optionValue}`)
          : label;
        return (
          <button
            type="button"
            key={optionValue}
            className={value === optionValue ? styles.active : undefined}
            onClick={() => onChange?.(optionValue)}
            title={t("timeline.viewLabel", { name: resolvedLabel })}
            aria-label={t("timeline.viewLabel", { name: resolvedLabel })}
            aria-pressed={value === optionValue}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            <span>{resolvedLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
