require('dotenv').config();
import Fastify from 'fastify';
import FastifyCors from '@fastify/cors';
import { ANIME } from '@consumet/extensions';

const fastify = Fastify({
  maxParamLength: 1000,
  logger: true,
});

let hianime: any = null;
let animepahe: any = null;

try {
  const AnimeModule: any = ANIME;
  const HianimeClass = AnimeModule?.Hianime || AnimeModule?.HiAnime;
  if (HianimeClass) hianime = new HianimeClass();

  const AnimePaheClass = AnimeModule?.AnimePahe;
  if (AnimePaheClass) animepahe = new AnimePaheClass();
} catch (err) {
  console.warn('Gagal memuat provider anime:', err);
}

const initApp = (async () => {
  const PORT = Number(process.env.PORT) || 3000;

  await fastify.register(FastifyCors, {
    origin: '*',
    methods: 'GET',
  });

  // 1. Root & Health
  fastify.get('/', (_, reply) => {
    console.log('[LOG] Root / diakses');
    reply.status(200).send('Welcome to consumet api! 🎉');
  });

  fastify.get('/health', (_, reply) => {
    reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 2. Info Anime & Daftar Episode
  fastify.get('/anime/anilist/info/:id', async (request: any, reply) => {
    const { id } = request.params;
    console.log(`[INFO REQUEST] Mengambil data anime ID: ${id}`);

    try {
      const gqlRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query ($id: Int) {
              Media (id: $id, type: ANIME) {
                id
                idMal
                title { romaji english }
                episodes
              }
            }
          `,
          variables: { id: Number(id) },
        }),
      });
      const gqlJson: any = await gqlRes.json();
      const media = gqlJson?.data?.Media;
      const totalEp = media?.episodes || 24;
      const episodes = [];
      for (let i = 1; i <= totalEp; i++) {
        episodes.push({
          id: `${id}?ep=${i}`,
          number: i,
          title: `Episode ${i}`,
        });
      }
      return reply.send({
        id,
        title: media?.title?.english || media?.title?.romaji,
        episodes,
      });
    } catch (err: any) {
      console.error('[INFO ERROR]', err.message);
      return reply.status(500).send({ error: err.message, episodes: [] });
    }
  });

  // 3. Watch Episode (Dengan Log Terperinci & Multi-Server)
  fastify.get('/anime/anilist/watch/:episodeId', async (request: any, reply) => {
    const { episodeId } = request.params;
    const [animeId, epPart] = episodeId.split('?');
    const epMatch = epPart ? epPart.match(/ep=(\d+)/) : null;
    const epNum = epMatch ? epMatch[1] : '1';

    console.log(`[WATCH REQUEST DITERIMA!] Anime ID: ${animeId}, Episode: ${epNum}`);

    // Coba ambil dari HiAnime/AnimePahe jika tersedia
    if (hianime) {
      try {
        const streamData = await hianime.fetchEpisodeSources(episodeId);
        if (streamData?.sources?.length > 0) {
          console.log('[WATCH SUCCESS] Sumber HiAnime HLS ditemukan');
          return reply.send(streamData);
        }
      } catch (e: any) {
        console.log('[WATCH NOTICE] HiAnime fallback:', e.message);
      }
    }

    // Server pemutar alternatif
    console.log(`[WATCH FALLBACK] Mengirimkan embed player untuk episode ${epNum}`);
    return reply.send({
      headers: { Referer: 'https://vidsrc.cc' },
      sources: [
        {
          url: `https://vidsrc.cc/v2/embed/anime/${animeId}/${epNum}/sub`,
          isM3U8: false,
          quality: 'default',
        },
      ],
      subtitles: [],
    });
  });

  // 404 Handler
  fastify.get('*', (req: any, reply) => {
    console.log(`[404 NOT FOUND] ${req.url}`);
    reply.status(404).send({ message: 'Route not found' });
  });

  if (!process.env.VERCEL) {
    fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
      if (err) throw err;
      console.log(`Server listening on ${address}`);
    });
  }
})();

export default async function handler(req: any, res: any) {
  await initApp;
  await fastify.ready();
  fastify.server.emit('request', req, res);
}
