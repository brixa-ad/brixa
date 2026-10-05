"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, MailCheck, UserRound } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { PasskeyLoginButton } from "@/components/passkey/PasskeyLoginButton";
import { Field, buttonClass, inputClass } from "@/components/ui/form";
import { blobToDataUrl, keepPendingLogo, shrinkLogo } from "@/lib/pending-logo";
import { signUp, type AuthState } from "./actions";

const LAST_EMAIL_KEY = "brixa.lastEmail";

function readLastEmail() {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email.trim());
  } catch {
    // private mode — nothing to remember
  }
}

export function LoginForm({
  signInError,
  callbackFailed,
  emailConfirmed,
}: {
  signInError: "invalidCredentials" | "genericError" | null;
  callbackFailed: boolean;
  emailConfirmed: boolean;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {});
  const [signingIn, setSigningIn] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState<"agency" | "solo">("agency");
  const [logo, setLogo] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const isSignUp = mode === "signUp";
  const isAgency = isSignUp && account === "agency";

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    const blob = await shrinkLogo(file);
    if (blob.size <= 2 * 1024 * 1024) setLogo(await blobToDataUrl(blob));
  }
  const pending = isSignUp ? signingUp : signingIn;

  // Pre-fill the last email used on this device, so only the password (or autofill) is needed.
  useEffect(() => {
    if (isSignUp || !emailRef.current || emailRef.current.value) return;
    const last = readLastEmail();
    if (last) emailRef.current.value = last;
  }, [isSignUp]);

  if (isSignUp && signUpState.checkEmail) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <MailCheck className="mx-auto size-10 text-accent-fg" />
        <p className="mt-4 text-sm text-fg-2">{t.auth.checkEmail}</p>
        {logo && account === "agency" && <p className="mt-3 text-xs text-muted">{t.auth.logoLater}</p>}
      </div>
    );
  }

  const error = isSignUp
    ? signUpState.error
      ? signUpState.error === "invalidEmail"
        ? t.errors.invalidEmail
        : t.auth[signUpState.error]
      : null
    : signInError
      ? t.auth[signInError]
      : callbackFailed
        ? t.auth.callbackError
        : null;

  return (
    <div className={`w-full ${isAgency ? "max-w-lg" : "max-w-sm"}`}>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {isSignUp ? t.auth.signUpTitle : t.auth.signInTitle}
        </h1>
        <p className="mt-2 text-sm font-medium tracking-wide text-fg-2">
          {t.auth.sloganA} <span className="text-accent-fg">{t.auth.sloganB}</span>
        </p>
      </div>

      <form
        key={mode}
        // Sign-in is a real form POST so password managers offer to save the password.
        {...(isSignUp ? { action: signUpAction } : { action: "/auth/sign-in", method: "post" })}
        onSubmit={
          isSignUp
            ? () => keepPendingLogo(account === "agency" ? logo : null)
            : () => {
                if (emailRef.current) rememberEmail(emailRef.current.value);
                setSigningIn(true);
              }
        }
        className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm"
      >
        {!isSignUp && <PasskeyLoginButton />}

        {emailConfirmed && !isSignUp && !error && (
          <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            {t.auth.emailConfirmed}
          </p>
        )}

        {isSignUp && (
          <>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["agency", Building2, t.auth.accountAgency, t.auth.accountAgencyHint],
                  ["solo", UserRound, t.auth.accountSolo, t.auth.accountSoloHint],
                ] as const
              ).map(([kind, Icon, label, hint]) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={account === kind}
                  onClick={() => setAccount(kind)}
                  className={`rounded-xl border p-3 text-left transition ${
                    account === kind ? "border-accent bg-accent-soft" : "border-line hover:bg-raised"
                  }`}
                >
                  <Icon className="size-5 text-accent-fg" />
                  <span className="mt-1.5 block text-sm font-semibold text-fg">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </button>
              ))}
            </div>
            <input type="hidden" name="accountType" value={account} />
            <p className="text-xs text-muted">{t.auth.invitedHint}</p>

            {isAgency && (
              <>
                <p className="border-t border-line-soft pt-4 text-xs font-semibold tracking-wide text-subtle uppercase">{t.auth.aboutAgency}</p>
                <Field label={t.auth.agencyTitle} required>
                  {(props) => (
                    <input {...props} name="agencyName" required maxLength={120} autoComplete="organization" className={inputClass} />
                  )}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <Field label={t.auth.legalName}>
                    {(props) => <input {...props} name="legalName" maxLength={200} className={inputClass} />}
                  </Field>
                  <Field label={t.auth.eik} hint={t.auth.eikHint}>
                    {(props) => <input {...props} name="eik" inputMode="numeric" maxLength={15} className={inputClass} />}
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <Field label={t.auth.city}>
                    {(props) => <input {...props} name="city" maxLength={80} autoComplete="address-level2" className={inputClass} />}
                  </Field>
                  <Field label={t.auth.officeAddress}>
                    {(props) => <input {...props} name="address" maxLength={200} autoComplete="street-address" className={inputClass} />}
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t.auth.agencyPhone}>
                    {(props) => <input {...props} name="agencyPhone" type="tel" maxLength={40} className={inputClass} />}
                  </Field>
                  <Field label={t.auth.website}>
                    {(props) => <input {...props} name="website" maxLength={200} inputMode="url" placeholder="www…" className={inputClass} />}
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-raised">
                    {logo ? (
                      <img src={logo} alt={t.auth.logo} className="size-full object-contain p-1" />
                    ) : (
                      <ImagePlus className="size-5 text-subtle" />
                    )}
                  </span>
                  <button type="button" onClick={() => logoInput.current?.click()} className={buttonClass.secondary}>
                    {logo ? t.auth.logoChange : t.auth.logoPick}
                  </button>
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(event) => pickLogo(event.target.files?.[0])}
                  />
                </div>
                <p className="border-t border-line-soft pt-4 text-xs font-semibold tracking-wide text-subtle uppercase">{t.auth.aboutYou}</p>
              </>
            )}

            <div className={isAgency ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "space-y-4"}>
              <Field label={t.auth.fullName} required>
                {(props) => <input {...props} name="fullName" required maxLength={120} autoComplete="name" className={inputClass} />}
              </Field>
              <Field label={t.auth.yourPhone}>
                {(props) => <input {...props} name="phone" type="tel" maxLength={40} autoComplete="tel" className={inputClass} />}
              </Field>
            </div>
          </>
        )}

        <Field label={t.auth.email} required>
          {(props) => (
            <input
              {...props}
              ref={emailRef}
              name="email"
              type="email"
              required
              // "username" is what password managers pair with the password field.
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={inputClass}
            />
          )}
        </Field>

        <Field label={t.auth.password} required hint={isSignUp ? t.auth.passwordHint : undefined}>
          {(props) => (
            <input
              {...props}
              name="password"
              type="password"
              required
              minLength={isSignUp ? 8 : undefined}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className={inputClass}
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className={`${buttonClass.primary} w-full`}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? t.common.loading : isSignUp ? t.auth.signUp : t.auth.signIn}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        {isSignUp ? t.auth.haveAccount : t.auth.noAccount}{" "}
        <button
          type="button"
          onClick={() => setMode(isSignUp ? "signIn" : "signUp")}
          className="font-semibold text-accent-fg hover:text-fg"
        >
          {isSignUp ? t.auth.signIn : t.auth.signUp}
        </button>
      </p>
    </div>
  );
}
