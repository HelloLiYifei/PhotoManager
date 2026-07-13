import styles from "./Ui.module.css";

export default function Field({
  label,
  htmlFor,
  hint = "",
  error = "",
  required = false,
  className = "",
  children,
}) {
  return (
    <div className={`${styles.field} ${className}`.trim()}>
      {label ? (
        <label htmlFor={htmlFor} className={styles.fieldLabel}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className={styles.fieldError} role="alert">{error}</p>
      ) : hint ? (
        <p className={styles.fieldHint}>{hint}</p>
      ) : null}
    </div>
  );
}
