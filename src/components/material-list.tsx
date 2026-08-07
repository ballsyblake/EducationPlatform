import { Badge } from "@/components/ui";
import { formatBytes } from "@/lib/uploads";
import type { MaterialKind } from "@prisma-client";

export type MaterialView = {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  url: string | null;
  upload: { id: string; filename: string; mimeType: string; size: number } | null;
};

const KIND_LABEL: Record<MaterialKind, string> = {
  FILE: "File",
  VIDEO: "Film",
  LINK: "Link",
};

/** Turns a YouTube/Vimeo watch URL into something that can be embedded. */
export function embedUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = url.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (url.pathname.startsWith("/embed/")) return url.toString();
    }
    if (host === "youtu.be") {
      return `https://www.youtube.com/embed${url.pathname}`;
    }
    if (host === "vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

function MaterialBody({ material }: { material: MaterialView }) {
  if (material.upload) {
    const isImage = material.upload.mimeType.startsWith("image/");
    const isVideo = material.upload.mimeType.startsWith("video/");
    const src = `/api/files/${material.upload.id}`;

    return (
      <div className="mt-3 space-y-2">
        {isVideo && (
          <video controls preload="metadata" className="w-full rounded-lg bg-black">
            <source src={src} type={material.upload.mimeType} />
          </video>
        )}
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={material.title} className="max-h-96 rounded-lg border border-ink-200" />
        )}
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <a href={src} target="_blank" rel="noreferrer" className="font-medium text-maroon-700 hover:underline">
            {material.upload.filename}
          </a>
          <span>{formatBytes(material.upload.size)}</span>
          <a href={`${src}?download=1`} className="text-ink-500 hover:text-maroon-700">
            Download
          </a>
        </div>
      </div>
    );
  }

  if (material.url) {
    const embed = material.kind === "VIDEO" ? embedUrl(material.url) : null;
    return (
      <div className="mt-3 space-y-2">
        {embed && (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              src={embed}
              title={material.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        <a
          href={material.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs font-medium text-maroon-700 hover:underline"
        >
          {material.url}
        </a>
      </div>
    );
  }

  return null;
}

export function MaterialList({ materials }: { materials: MaterialView[] }) {
  return (
    <div className="space-y-4">
      {materials.map((material) => (
        <div key={material.id} className="card card-pad">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink-900">{material.title}</h3>
              {material.description && (
                <p className="mt-1 text-sm text-ink-600">{material.description}</p>
              )}
            </div>
            <Badge tone={material.kind === "VIDEO" ? "info" : "muted"}>
              {KIND_LABEL[material.kind]}
            </Badge>
          </div>
          <MaterialBody material={material} />
        </div>
      ))}
    </div>
  );
}
