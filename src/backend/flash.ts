import fp from "fastify-plugin";
import { FastifyReply, FastifyRequest, FastifyPluginCallback } from "fastify";

export const FLASH_MESSAGE_COOKE = "flash";

const pluginCallback: FastifyPluginCallback = (fastify, _options, next) => {
  fastify.addHook(
    "onRequest",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.setCookie(FLASH_MESSAGE_COOKE, "", {
        path: "/",
      });
    }
  );
  next();
};

export const clearFlashCookie = fp(pluginCallback);
