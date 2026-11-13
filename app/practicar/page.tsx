import type { Metadata } from "next";
import { Practice } from "@/components/practice";

export const metadata: Metadata = {
  title: "Práctica",
  description: "Mueve las blancas y las negras en el mismo tablero.",
};

export default function PracticePage() {
  return <Practice />;
}
