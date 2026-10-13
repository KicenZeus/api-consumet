require('dotenv').config();
import Fastify from 'fastify';
import FastifyCors from '@fastify/cors';
import { ANIME } from '@consumet/extensions';

const fastify = Fastify({
  maxParamLength: 1000,
  logger: true,
});

// Provider anime resmi yang aktif di versi 1.8.8
const hianime = new ANIME.HiAnime();
const animepahe = new ANIME.AnimePahe();

const initApp = (async () => {
  const PORT = Number(process.env.PORT) || 3000;

  await fastify.register(FastifyCors, {
    origin: '*',
    methods: 'GET',
  });

  // 1. Root & Health Check
  fastify.get('/', (_, reply) => {
    reply.status(200).send('Welcome to consumet api! 🎉');
  });

  fastify.get('/health', (_, reply) => {
    reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 2. Pencarian Anime (HiAnime / AnimePahe)
  fastify.get('/anime/search', async (request: any, reply) => {
    const query = request.query.query || request.query.q || request.query.keyword;
    if (!query) return reply.status(400).send({ error: 'Parameter query diperlukan' });

    try {
      const data = await hianime.search(query).catch(async () => {
        return await animepahe.search(query);
      });
      return reply.send(data);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, results: [] });
    }
  });

  // 3. Info Anime & Daftar Episode
  fastify.get('/anime/info/:id', async (request: any, reply) => {
    const { id } = request.params;
    try {
      const data = await hianime.fetchAnimeInfo(id).catch(async () => {
        return await animepahe.fetchAnimeInfo(id);
      });
      return reply.send(data);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 4. Ambil Link Video Streaming Episode (.m3u8)
  fastify.get('/anime/watch/:episodeId', async (request: any, reply) => {
    const { episodeId } = request.params;
    const { server } = request.query;

    try {
      const data = await hianime.fetchEpisodeSources(episodeId, server).catch(async () => {
        return await animepahe.fetchEpisodeSources(episodeId);
      });
      return reply.send(data);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, sources: [] });
    }
  });

  // 5. Endpoint AniList Info (Sinkron dengan AniList ID frontend)
  fastify.get('/anime/anilist/info/:id', async (request: any, reply) => {
    const { id } = request.params;
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
      return reply.status(500).send({ error: err.message, episodes: [] });
    }
  });

  // 6. Endpoint AniList Watch
  fastify.get('/anime/anilist/watch/:episodeId', async (request: any, reply) => {
    const { episodeId } = request.params;
    const [animeId, epPart] = episodeId.split('?');
    const epMatch = epPart ? epPart.match(/ep=(\d+)/) : null;
    const epNum = epMatch ? epMatch[1] : '1';

    return reply.send({
      headers: { Referer: 'https://player.videasy.to' },
      sources: [
        {
          url: `https://player.videasy.to/anime/${animeId}/${epNum}/sub`,
          isM3U8: false,
          quality: 'default',
        },
      ],
      subtitles: [],
    });
  });

  // 404 Handler
  fastify.get('*', (_, reply) => {
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
