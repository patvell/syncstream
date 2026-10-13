import { NextResponse } from "next/server";

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const searchParams = new URL(request.url).searchParams;

  const tmdbUrl = new URL(`${TMDB_API_BASE}/${path.join("/")}`);
  tmdbUrl.searchParams.set("api_key", TMDB_API_KEY!);

  searchParams.forEach((value, key) => {
    tmdbUrl.searchParams.set(key, value);
  });

  try {
    const res = await fetch(tmdbUrl.toString());
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.status_message || "TMDB API error" },
        { status: res.status }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch data from TMDB" },
      { status: 500 }
    );
  }
}