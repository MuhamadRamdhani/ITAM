import fp from "fastify-plugin";

export default fp(async function errorHandler(app) {
  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);

    const status =
      err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
      
    const code =
      err.validation ? "VALIDATION_ERROR" :
      (typeof err.code === "string" && err.code) ? err.code :
      err.code === "23505" ? "DUPLICATE" :
      err.code === "22P02" ? "INVALID_INPUT" :
      "INTERNAL_ERROR";

    reply.status(status).send({
      ok: false,
      error: {
        code,
        message: err.message || "Unexpected error",
        details: err.details || err.validation || undefined,
      },
      meta: { request_id: req.id },
    });
  });
});