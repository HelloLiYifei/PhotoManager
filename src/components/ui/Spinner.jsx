import { LoaderCircle } from "lucide-react";

import { useI18n } from "../../i18n";
import { uiStyles as styles } from "../../themes/classNames";

export default function Spinner({
  label = null,
  size = "md",
  showLabel = false,
  className = "",
}) {
  const { t } = useI18n();
  const resolvedLabel = label || t("common.loading");
  const normalizedSize = size === "small" ? "sm" : size === "large" ? "lg" : size;
  return (
    <span
      className={`${styles.spinnerWrap} ${showLabel ? styles.spinnerWithLabel : ""} ${className}`.trim()}
      role="status"
      aria-label={resolvedLabel}
    >
      <LoaderCircle
        className={`${styles.spinner} ${styles[`spinner_${normalizedSize}`] || styles.spinner_md}`}
        aria-hidden="true"
      />
      {showLabel ? <span>{resolvedLabel}</span> : null}
    </span>
  );
}
