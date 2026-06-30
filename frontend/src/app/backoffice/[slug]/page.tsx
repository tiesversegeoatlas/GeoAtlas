import { AdminPortal } from "@/components/portal/AdminPortal";

export default async function BackofficePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AdminPortal slug={slug} />;
}
