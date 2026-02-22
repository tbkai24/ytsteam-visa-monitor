import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ParsedRow = {
  rank: number
  country: string
}

const DEFAULT_VIDEO_ID = '0t6GNcINKeU'

function cleanText(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function decodeHtml(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
}

function parseKworbRanks(rawHtml: string): ParsedRow[] {
  const withoutScripts = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const plain = decodeHtml(withoutScripts.replace(/<[^>]+>/g, ' '))

  const pattern = /#\s*(\d{1,3})\s+([A-Za-z][A-Za-z .'-]{1,80})/g
  const rows: ParsedRow[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = pattern.exec(plain)) !== null) {
    const rank = Number(match[1])
    const country = cleanText(match[2])
    if (!Number.isFinite(rank) || rank <= 0 || !country) continue

    const key = country.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ rank, country })

    if (rows.length >= 100) break
  }

  return rows.sort((a, b) => a.rank - b.rank || a.country.localeCompare(b.country))
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const videoId = (Deno.env.get('YOUTUBE_VIDEO_ID') ?? DEFAULT_VIDEO_ID).trim() || DEFAULT_VIDEO_ID
  const kworbUrl = (Deno.env.get('KWORB_TRENDING_URL') ?? `https://kworb.net/youtube/trending/video/${videoId}.html`).trim()

  if (!supabaseUrl || !serviceRole) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          'Missing required secrets: PROJECT_URL/SUPABASE_URL and SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const response = await fetch(kworbUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YTSteamVisaMonitor/1.0)',
      },
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Kworb fetch failed (${response.status})` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const html = await response.text()
    const rows = parseKworbRanks(html)

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: false, error: 'No country ranks parsed from Kworb page' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const nowIso = new Date().toISOString()
    const upsertPayload = rows.map((row) => ({
      video_id: videoId,
      country: row.country,
      rank: row.rank,
      source: 'kworb',
      captured_at: nowIso,
    }))

    const { error: upsertError } = await supabase
      .from('visa_trending_current')
      .upsert(upsertPayload, { onConflict: 'video_id,country' })

    if (upsertError) {
      return new Response(JSON.stringify({ ok: false, error: upsertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const countryList = rows.map((row) => row.country)
    if (countryList.length > 0) {
      const quoted = countryList.map((country) => `"${country.replaceAll('"', '""')}"`).join(',')
      const { error: deleteError } = await supabase
        .from('visa_trending_current')
        .delete()
        .eq('video_id', videoId)
        .not('country', 'in', `(${quoted})`)

      if (deleteError) {
        return new Response(JSON.stringify({ ok: false, error: deleteError.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        video_id: videoId,
        captured_at: nowIso,
        count: rows.length,
        rows,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown function error'
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
