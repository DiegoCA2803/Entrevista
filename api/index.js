import { createApp } from '../backend/dist/app.js';
let ready;
export default async function handler(req, res) {
  if (!ready) {
    ready = createApp();
    ready.catch(() => {
      ready = undefined;
    });
  }
  try {
    const { app } = await ready;
    return app(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'No se pudo iniciar la aplicación. Revisa la base de datos y las variables de entorno.'
      })
    );
  }
}
