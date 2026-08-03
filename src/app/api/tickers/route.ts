import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchTickers } from '@/lib/brapi';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get('q') ?? '';
  const matches = await searchTickers(query);

  return NextResponse.json({ matches: matches ?? [] });
}
