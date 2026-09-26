import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PasskeyManager } from "@/components/passkey/PasskeyManager";
import { Card, buttonClass } from "@/components/ui/form";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AvatarUploader } from "./AvatarUploader";
import { ProfileForm } from "./ProfileForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.profile.title };
}

export default async function ProfilePage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t }, { data: profile }] = await Promise.all([
    getI18n(),
    supabase
      .from("profiles")
      .select("full_name, phone, job_title, bio, areas, avatar_path")
      .eq("id", session.userId)
      .single(),
  ]);

  const name = profile?.full_name || session.email;

  return (
    <>
      <PageHeader
        title={t.profile.title}
        subtitle={t.profile.subtitle}
        actions={
          <Link href={`/team/${session.userId}`} className={buttonClass.secondary}>
            <Eye className="size-4" />
            {t.profile.viewPublic}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title={t.profile.photo}>
            <AvatarUploader userId={session.userId} avatarPath={profile?.avatar_path ?? null} name={name} />
          </Card>
          <PasskeyManager />
        </div>

        <Card>
          <ProfileForm
            initial={{
              fullName: profile?.full_name ?? "",
              phone: profile?.phone ?? "",
              jobTitle: profile?.job_title ?? "",
              bio: profile?.bio ?? "",
              areas: profile?.areas ?? [],
            }}
          />
        </Card>
      </div>
    </>
  );
}
