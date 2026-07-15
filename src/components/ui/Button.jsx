import { forwardRef } from "react";

import { uiStyles as styles } from "../../themes/classNames";

const Button = forwardRef(function Button({
  type = "button",
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...props
}, ref) {
  const normalizedSize = size === "small" ? "sm" : size === "large" ? "lg" : size;
  const classes = [
    styles.button,
    styles[`button_${variant}`] || styles.button_secondary,
    styles[`button_${normalizedSize}`] || styles.button_md,
    fullWidth ? styles.buttonFullWidth : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button ref={ref} type={type} className={classes} {...props}>
      {children}
    </button>
  );
});

export default Button;
