import { LoaderCircle } from "lucide-react";

import styles from "./Ui.module.css";

export default function Spinner({
  label = "正在加载",
  size = "md",
  showLabel = false,
  className = "",
}) {
  const normalizedSize = size === "small" ? "sm" : size === "large" ? "lg" : size;
  return (
    <span
      className={`${styles.spinnerWrap} ${showLabel ? styles.spinnerWithLabel : ""} ${className}`.trim()}
      role="status"
      aria-label={label}
    >
      <LoaderCircle
        className={`${styles.spinner} ${styles[`spinner_${normalizedSize}`] || styles.spinner_md}`}
        aria-hidden="true"
      />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
