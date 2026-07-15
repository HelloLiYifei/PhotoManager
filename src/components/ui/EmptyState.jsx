import { createElement, isValidElement } from "react";

import { uiStyles as styles } from "../../themes/classNames";

export default function EmptyState({
  icon: Icon,
  title,
  description = "",
  actions = null,
  action = null,
  role = "status",
  className = "",
}) {
  const renderedIcon = isValidElement(Icon)
    ? Icon
    : Icon
      ? createElement(Icon, { "aria-hidden": true })
      : null;

  return (
    <section className={`${styles.emptyState} ${className}`.trim()} role={role}>
      {renderedIcon ? <span className={styles.emptyIcon}>{renderedIcon}</span> : null}
      {title ? <h2>{title}</h2> : null}
      {description ? <p>{description}</p> : null}
      {actions || action ? <div className={styles.emptyActions}>{actions || action}</div> : null}
    </section>
  );
}
