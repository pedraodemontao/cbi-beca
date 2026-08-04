import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O preço teto é a porta de entrada do produto: a carteira é o segundo passo,
  // depois que a usuária já achou o que quer comprar.
  redirect(user ? "/preco-teto" : "/login");
}
