"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { PasskeyLoginButton } from "@/components/passkey/PasskeyLoginButton";
import { Field, buttonClass, inputClass } from "@/components/ui/form";
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

  const isSignUp = mode === "signUp";
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
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {isSignUp ? t.auth.signUpTitle : t.auth.signInTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.auth.tagline}</p>
      </div>

      <form
        key={mode}
        // Sign-in is a real form POST so password managers offer to save the password.
        {...(isSignUp ? { action: signUpAction } : { action: "/auth/sign-in", method: "post" })}
        onSubmit={
          isSignUp
            ? undefined
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
            <Field label={t.auth.fullName}>
              {(props) => <input {...props} name="fullName" autoComplete="name" className={inputClass} />}
            </Field>
            <Field label={t.auth.agencyName} hint={t.auth.agencyHint}>
              {(props) => (
                <input {...props} name="agencyName" autoComplete="organization" className={inputClass} />
              )}
            </Field>
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
