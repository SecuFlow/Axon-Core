"use server";

import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export type CreateAdminUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type CreateAdminUserResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createAdminUserAction(
  input: CreateAdminUserInput,
): Promise<CreateAdminUserResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const password = input.password;

  if (!firstName || !lastName) {
    return { ok: false, error: "Vor- und Nachname sind erforderlich." };
  }
  if (!email) {
    return { ok: false, error: "E-Mail ist erforderlich." };
  }
  if (!password || password.length < 8) {
    return {
      ok: false,
      error: "Temporäres Passwort muss mindestens 8 Zeichen haben.",
    };
  }

  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return { ok: false, error: ctx.error };
  }

  const { service } = ctx;

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });

  if (createError || !created?.user?.id) {
    return {
      ok: false,
      error: createError?.message ?? "Nutzer konnte nicht angelegt werden.",
    };
  }

  const userId = created.user.id;
  const displayName = `${firstName} ${lastName}`.trim();

  const { error: companyError } = await service.from("companies").upsert(
    {
      user_id: userId,
      name: displayName,
      role: "admin",
      is_subscribed: true,
    },
    { onConflict: "user_id" },
  );

  if (companyError) {
    return {
      ok: false,
      error: `Auth-User angelegt, companies fehlgeschlagen: ${companyError.message}`,
    };
  }

  return { ok: true };
}
