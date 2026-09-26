import { useId } from "react";

export const inputClass =
  "block w-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-base text-fg shadow-xs sm:text-sm " +
  "placeholder:text-subtle transition focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface disabled:text-subtle " +
  "aria-invalid:border-danger/70 aria-invalid:focus:ring-danger/25";

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-xs transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-fg-2 shadow-xs transition hover:bg-raised disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-surface px-4 py-2 text-sm font-semibold text-danger shadow-xs transition hover:bg-danger/10 disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-fg-2 transition hover:bg-raised hover:text-fg",
};

export function Card({
  title,
  description,
  id,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6 ${className}`}
    >
      {title && (
        <header className="mb-5">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Label + control + error. The render prop receives the id and aria props to spread on the control.
 */
export function Field({
  label,
  required,
  error,
  hint,
  className = "",
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const messageId = `${id}-message`;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg-2">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children({
        id,
        ...(error ? { "aria-invalid": true } : {}),
        ...(error || hint ? { "aria-describedby": messageId } : {}),
      })}
      {error ? (
        <p id={messageId} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
