import type { Metadata } from "next";
import { Room } from "@/components/room";
import { formatCode, normalizeCode } from "@/lib/local";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}): Promise<Metadata> {
  const { codigo } = await params;
  const code = normalizeCode(codigo);
  return { title: code.length === 6 ? `Sala ${formatCode(code)}` : "Sala" };
}

export default async function SalaPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  return <Room code={normalizeCode(codigo)} />;
}
