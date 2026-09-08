export default async (req, res) => {
  const { reqHandler } = await import('../dist/territory-frontend/server/server.mjs');
  return reqHandler(req, res);
};
