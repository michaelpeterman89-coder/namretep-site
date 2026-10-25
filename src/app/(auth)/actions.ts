"use server";

import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath, validateEmail, validatePassword, validateUsername } from "@/lib/validation";

export type AuthFormState = {
  error?: string;
  message?: string;
  values?: { username?: string; email?: string };
};

function friendlyAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "user_already_exists":
    case "email_exists":
      return "An account with that email already exists. Try logging in.";
    case "user_banned":
      return "This account has been suspended.";
    case "weak_password":
      return "That password is too weak. Try a longer one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { username, email };

  const invalid = validateUsername(username) ?? validateEmail(email) ?? validatePassword(password);
  if (invalid) return { error: invalid, values };

  const supabase = await createClient();

  const { data: available, error: rpcError } = await supabase.rpc("username_available", {
    name: username,
  });
  if (rpcError) return { error: "Something went wrong. Please try again.", values };
  if (!available) return { error: "That username is taken.", values };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) return { error: friendlyAuthError(error), values };

  // With "Confirm email" turned on in Supabase, there's no session until the
  // player clicks the link in their inbox.
  if (!data.session) {
    return { message: "Check your email to confirm your account, then log in.", values };
  }

  redirect("/profile");
}

export async function logIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email };

  if (!email || !password) return { error: "Enter your email and password.", values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyAuthError(error), values };

  redirect(safeRedirectPath(formData.get("next")));
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
