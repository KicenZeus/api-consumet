require('dotenv').config();
import Fastify from 'fastify';
import FastifyCors from '@fastify/cors';

const fastify = Fastify({
  maxParamLength: 1000,
  logger: true,
});

const initApp = (async () => {
  const PORT = Number(process.env.PORT) || 3000;

  await fastify.register(FastifyCors, {
    origin: '*',
    methods: 'GET',
  });

  // Endpoint Utama
  fastify.get('/', (_, reply) => {
    reply.status(200).send('Welcome to consumet api! 🎉');
  });

  // Health check
  fastify.get('/health', (_, reply) => {
    reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Endpoint 404
  fastify.get('*', (request, reply) => {
    reply.status(404).send({
      message: 'route not found',
      error: 'page not found',
    });
  });

  // Jalankan listener jika bukan di environment Vercel serverless
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
