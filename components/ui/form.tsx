import { useId } from "react";

export const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs " +
  "placeholder:text-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 " +
  "aria-invalid:border-red-400 aria-invalid:focus:ring-red-500/15";

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-xs transition hover:bg-red-50 disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900",
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
      className={`scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 ${className}`}
    >
      {title && (
        <header className="mb-5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children({
        id,
        ...(error ? { "aria-invalid": true } : {}),
        ...(error || hint ? { "aria-describedby": messageId } : {}),
      })}
      {error ? (
        <p id={messageId} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
