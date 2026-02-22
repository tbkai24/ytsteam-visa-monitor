import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type YouTubeApiResponse = {
  items?: Array<{
    id?: string
    snippet?: {
      title?: string
      thumbnails?: {
        maxres?: { url?: string }
        standard?: { url?: string }
        high?: { url?: string }
        medium?: { url?: string }
        default?: { url?: string }
      }
    }
    statistics?: {
      viewCount?: string
      likeCount?: string
      commentCount?: string
    }
  }>
  error?: {
    message?: string
  }
}

type KworbTrendingRow = {
  rank: number
  country: string
}

type KworbCategoryResult = {
  category: 'overall' | 'music' | 'music_worldwide'
  rows: KworbTrendingRow[]
}

const toNumber = (value: string | undefined) => {
  if (!value) return 0
  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? asNumber : 0
}

const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim()

const decodeHtml = (value: string) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')

const parseKworbRanksFromText = (plainText: string): KworbTrendingRow[] => {
  const pattern = /#\s*(\d{1,3})\s+([A-Za-z][A-Za-z .'-]{1,80})/g
  const rows: KworbTrendingRow[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = pattern.exec(plainText)) !== null) {
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

const parseKworbCategories = (rawHtml: string): KworbCategoryResult[] => {
  const readSection = (category: 'overall' | 'music') => {
    const blockMatch = rawHtml.match(new RegExp(`<div class="${category}"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'))
    if (!blockMatch?.[1]) return []

    const plain = decodeHtml(blockMatch[1].replace(/<[^>]+>/g, ' '))
    return parseKworbRanksFromText(plain)
  }

  const overallRows = readSection('overall')
  const musicRows = readSection('music')
  const results: KworbCategoryResult[] = []

  if (overallRows.length) results.push({ category: 'overall', rows: overallRows })
  if (musicRows.length) results.push({ category: 'music', rows: musicRows })

  if (!results.length) {
    const withoutScripts = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    const plainAll = decodeHtml(withoutScripts.replace(/<[^>]+>/g, ' '))
    const fallbackRows = parseKworbRanksFromText(plainAll)
    if (fallbackRows.length) {
      results.push({ category: 'overall', rows: fallbackRows })
    }
  }

  return results
}

const parseMusicWorldwide = (
  rawHtml: string,
  videoTitle: string,
): number | null => {
  const normalizedHtml = rawHtml.replace(/\r?\n/g, ' ')
  const compactTitle = cleanText(videoTitle).toLowerCase()

  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi
  const rowMatches = normalizedHtml.match(rowPattern) ?? []

  const rowHtml = rowMatches.find((row) =>
    cleanText(decodeHtml(row.replace(/<[^>]+>/g, ' '))).toLowerCase().includes(compactTitle),
  )
  if (!rowHtml) return null

  const cells: string[] = []
  const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let tdMatch: RegExpExecArray | null
  while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
    cells.push(cleanText(decodeHtml(tdMatch[1].replace(/<[^>]+>/g, ' '))))
  }
  if (!cells.length) return null

  const worldwideRank = Number(cells[0].match(/\d{1,3}/)?.[0] ?? '')
  if (!Number.isFinite(worldwideRank) || worldwideRank <= 0) return null

  return worldwideRank
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY')
  const youtubeVideoId = Deno.env.get('YOUTUBE_VIDEO_ID')
  const defaultKworbUrl = `https://kworb.net/youtube/trending/video/${youtubeVideoId}.html`
  const kworbUrl = (Deno.env.get('KWORB_TRENDING_URL') ?? defaultKworbUrl).trim()
  const kworbWorldwideUrl = (Deno.env.get('KWORB_TRENDING_WORLDWIDE_URL') ?? 'https://kworb.net/youtube/trending.html').trim()

  if (!supabaseUrl || !supabaseServiceRoleKey || !youtubeApiKey || !youtubeVideoId) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          'Missing required secrets: PROJECT_URL/SUPABASE_URL, SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY, YOUTUBE_API_KEY, YOUTUBE_VIDEO_ID',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
    ytUrl.searchParams.set('part', 'snippet,statistics')
    ytUrl.searchParams.set('id', youtubeVideoId)
    ytUrl.searchParams.set('key', youtubeApiKey)

    const ytResponse = await fetch(ytUrl.toString())
    const ytJson = (await ytResponse.json()) as YouTubeApiResponse

    if (!ytResponse.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: ytJson.error?.message ?? 'YouTube API request failed',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const item = ytJson.items?.[0]
    if (!item) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No video data returned. Check YOUTUBE_VIDEO_ID and API restrictions.',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const capturedAt = new Date().toISOString()
    const views = toNumber(item.statistics?.viewCount)
    const likes = toNumber(item.statistics?.likeCount)
    const comments = toNumber(item.statistics?.commentCount)
    const thumbnailUrl =
      item.snippet?.thumbnails?.maxres?.url ??
      item.snippet?.thumbnails?.standard?.url ??
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { error: insertError } = await supabase.from('monitoring_snapshots').insert({
      captured_at: capturedAt,
      views,
      likes,
      comments,
      views_per_hour: null,
    })

    if (insertError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: insertError.message,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { error: settingsError } = await supabase
      .from('app_settings')
      .upsert({ id: 1, hero_image_url: thumbnailUrl }, { onConflict: 'id' })

    if (settingsError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Snapshot inserted but hero image update failed: ${settingsError.message}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    let kworbCount = 0
    let kworbError: string | null = null

    try {
      const kworbResponse = await fetch(kworbUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; YTSteamVisaMonitor/1.0)',
        },
      })
      if (!kworbResponse.ok) {
        throw new Error(`Kworb fetch failed (${kworbResponse.status})`)
      }
      const kworbHtml = await kworbResponse.text()
      const results = parseKworbCategories(kworbHtml)
      if (!results.length) {
        throw new Error('No overall/music ranks parsed from Kworb page')
      }

      const worldwideResponse = await fetch(kworbWorldwideUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; YTSteamVisaMonitor/1.0)',
        },
      })
      if (worldwideResponse.ok) {
        const worldwideHtml = await worldwideResponse.text()
        const worldwideRank = parseMusicWorldwide(worldwideHtml, item.snippet?.title ?? '')
        if (worldwideRank) {
          results.push({
            category: 'music_worldwide',
            rows: [{ rank: worldwideRank, country: 'Worldwide' }],
          })
        }
      }

      const upsertPayload = results.flatMap((result) =>
        result.rows.map((row) => ({
          video_id: youtubeVideoId,
          category: result.category,
          country: row.country,
          rank: row.rank,
          source: 'kworb',
          captured_at: capturedAt,
        })),
      )

      const { error: trendUpsertError } = await supabase
        .from('visa_trending_current')
        .upsert(upsertPayload, { onConflict: 'video_id,category,country' })

      if (trendUpsertError) {
        kworbError = trendUpsertError.message
      } else {
        kworbCount = upsertPayload.length

        for (const result of results) {
          const quotedCountries = result.rows
            .map((row) => `"${row.country.replaceAll('"', '""')}"`)
            .join(',')
          const { error: trendCleanupError } = await supabase
            .from('visa_trending_current')
            .delete()
            .eq('video_id', youtubeVideoId)
            .eq('category', result.category)
            .not('country', 'in', `(${quotedCountries})`)

          if (trendCleanupError) {
            kworbError = trendCleanupError.message
            break
          }
        }

        const { error: staleWorldwideCountryCleanupError } = await supabase
          .from('visa_trending_current')
          .delete()
          .eq('video_id', youtubeVideoId)
          .eq('category', 'music_worldwide_country')
        if (staleWorldwideCountryCleanupError) {
          kworbError = staleWorldwideCountryCleanupError.message
        }
      }
    } catch (error) {
      kworbError = error instanceof Error ? error.message : 'Unknown Kworb sync error'
    }

    return new Response(
      JSON.stringify({
        ok: true,
        video_id: item.id ?? youtubeVideoId,
        title: item.snippet?.title ?? '',
        captured_at: capturedAt,
        views,
        likes,
        comments,
        thumbnail_url: thumbnailUrl,
        kworb_count: kworbCount,
        kworb_error: kworbError,
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
