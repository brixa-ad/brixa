"use client";

import { useActionState, useState } from "react";
import { MailCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Field, buttonClass, inputClass } from "@/components/ui/form";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm({
  callbackFailed,
  emailConfirmed,
}: {
  callbackFailed: boolean;
  emailConfirmed: boolean;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {});

  const isSignUp = mode === "signUp";
  const state = isSignUp ? signUpState : signInState;
  const pending = isSignUp ? signingUp : signingIn;

  if (isSignUp && signUpState.checkEmail) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <MailCheck className="mx-auto size-10 text-indigo-600" />
        <p className="mt-4 text-sm text-slate-600">{t.auth.checkEmail}</p>
      </div>
    );
  }

  const error = state.error
    ? state.error === "invalidEmail"
      ? t.errors.invalidEmail
      : t.auth[state.error]
    : callbackFailed && !isSignUp
      ? t.auth.callbackError
      : null;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {isSignUp ? t.auth.signUpTitle : t.auth.signInTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t.auth.tagline}</p>
      </div>

      <form
        key={mode}
        action={isSignUp ? signUpAction : signInAction}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {emailConfirmed && !isSignUp && !state.error && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t.auth.emailConfirmed}
          </p>
        )}

        {isSignUp && (
          <>
            <Field label={t.auth.fullName}>
              {(props) => (
                <input {...props} name="fullName" autoComplete="name" className={inputClass} />
              )}
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
              name="email"
              type="email"
              required
              autoComplete="email"
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
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className={`${buttonClass.primary} w-full`}>
          {pending ? t.common.loading : isSignUp ? t.auth.signUp : t.auth.signIn}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        {isSignUp ? t.auth.haveAccount : t.auth.noAccount}{" "}
        <button
          type="button"
          onClick={() => setMode(isSignUp ? "signIn" : "signUp")}
          className="font-semibold text-indigo-600 hover:text-indigo-500"
        >
          {isSignUp ? t.auth.signIn : t.auth.signUp}
        </button>
      </p>
    </div>
  );
}
