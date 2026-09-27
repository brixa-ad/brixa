"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { deletePropertyDocument, documentsChanged } from "@/app/(app)/properties/documents";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { DOCUMENT_ACCEPT, DOCUMENT_BUCKET, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/documents";
import { formatDate, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export type PropertyDocument = {
  id: string;
  name: string;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
  uploader: string | null;
};

/** Upload, download and remove a property's documents. */
export function PropertyDocuments({
  propertyId,
  organizationId,
  userId,
  documents,
}: {
  propertyId: string;
  organizationId: string;
  userId: string;
  documents: PropertyDocument[];
}) {
  const { t, lang } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const size = (bytes: number | null) =>
    bytes === null ? "" : bytes >= 1024 * 1024 ? `${formatNumber(bytes / 1024 / 1024, lang, 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = [...files];
    if (list.some((f) => f.size > MAX_DOCUMENT_BYTES)) return setError(t.documents.tooBig);
    if (list.some((f) => f.type && !DOCUMENT_TYPES.includes(f.type))) return setError(t.documents.badType);

    setUploading(true);
    const supabase = createClient();
    let failed = false;
    for (const file of list) {
      const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().slice(0, 8) : "bin";
      // The file keeps a safe name in storage; its real name is kept with the record.
      const path = `${organizationId}/${propertyId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadError) {
        console.error("Document upload failed:", uploadError.message);
        failed = true;
        continue;
      }
      const { error: rowError } = await supabase.from("property_documents").insert({
        property_id: propertyId,
        name: file.name.slice(0, 200),
        storage_path: path,
        size_bytes: file.size,
        mime_type: file.type || null,
        uploaded_by: userId,
      });
      if (rowError) {
        console.error("Saving a document failed:", rowError.message);
        await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
        failed = true;
      }
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    if (failed) setError(t.documents.failed);
    await documentsChanged(propertyId);
  }

  return (
    <div className="space-y-4">
      {documents.length === 0 ? (
        <p className="text-sm text-muted">{t.documents.empty}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.name}</p>
                <p className="truncate text-xs text-muted">
                  {[size(doc.size_bytes), formatDate(doc.created_at, lang), doc.uploader].filter(Boolean).join(" · ")}
                </p>
              </div>
              {doc.url && (
                <a
                  href={doc.url}
                  title={t.documents.download}
                  aria-label={t.documents.download}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
                >
                  <Download className="size-4" />
                </a>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(t.documents.deleteConfirm)) return;
                  startTransition(async () => {
                    const result = await deletePropertyDocument(doc.id);
                    if (!result.ok) setError(t.errors.generic);
                  });
                }}
                title={t.common.delete}
                aria-label={t.common.delete}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      <button type="button" disabled={uploading} onClick={() => input.current?.click()} className={`${buttonClass.secondary} w-full`}>
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {uploading ? t.documents.uploading : t.documents.upload}
      </button>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <p className="text-xs text-muted">{t.documents.hint}</p>
    </div>
  );
}
