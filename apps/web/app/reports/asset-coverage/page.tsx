import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function AssetCoveragePage({ searchParams }: Props) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && String(item).trim()) params.append(key, String(item));
      }
      continue;
    }
    if (value != null && String(value).trim()) {
      params.set(key, String(value));
    }
  }

  const qs = params.toString();
  redirect(`/reports/asset-mapping${qs ? `?${qs}` : ""}`);
}
