import path from "path";
import dotenv from "dotenv";
import type { FastifyRequest } from "fastify";
import type { FastifyReply } from "fastify/types/reply";
import z from "zod";
import nunjucks from "nunjucks";
import formbody from "@fastify/formbody";
import staticFiles from "@fastify/static";
import cookie from "@fastify/cookie";
import { hashPassword, comparePassword } from "./auth";
import { connect, newDb, sqliteUserRepository, SqlliteSession } from "./db";
import fastify from "fastify";
import { clearFlashCookie, FLASH_MESSAGE_COOKE } from "./flash";
import { checkUsername } from "../shared/user-name-rules";
import { checkComplexity } from "../shared/password-rules";

dotenv.config();

const SESSION_COOKIE = "SESSION_ID";

const environment = process.env.NODE_ENV;
const cookieSecret = process.env.COOKIE_SECRET;
if (cookieSecret === undefined) {
  console.error("must set COOKIE_SECRET environment variable");
  process.exit(1);
}
const templates = new nunjucks.Environment(
  new nunjucks.FileSystemLoader("src/backend/templates")
);
const USERS_DB = "./users.sqlite";

const server = fastify({
  logger: true,
});

const accountCreateRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
  agreedToTerms: z.string().optional(),
});

type accountCreateRequest = z.infer<typeof accountCreateRequestSchema>;

const accountLoginRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
});

type accountLoginRequest = z.infer<typeof accountLoginRequestSchema>;

{
  server.register(formbody);

  server.register(cookie, {
    secret: cookieSecret,
  });

  server.register(clearFlashCookie);

  server.register(staticFiles, {
    root: path.join(__dirname, "../../dist"),
  });
}

function setFlashnCookie(reply: FastifyReply, message: string): void {
  reply.setCookie(FLASH_MESSAGE_COOKE, message, {
    path: "/",
  });
}

function readFlashCookie(request: FastifyRequest): string | undefined {
  return request.cookies[FLASH_MESSAGE_COOKE];
}

function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: "/",
    maxAge: 60,
  });
}

function readSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}

server.get("/", async (request, reply) => {
  await reply.redirect("/signin");
});

server.get("/signup", async (request, reply) => {
  const serverMessage = readFlashCookie(request);
  const rendered = templates.render("signup.njk", {
    server_msg: serverMessage,
    environment,
  });
  return await reply.header("Content-Type", "text/html").send(rendered);
});

server.post("/account/signup", async (request, reply) => {
  let requestData: accountCreateRequest;
  try {
    requestData = accountCreateRequestSchema.parse(request.body);
  } catch (err) {
    setFlashnCookie(reply, "There was an error processing your request.");
    return await reply.redirect("/signup");
  }

  if (requestData.agreedToTerms !== "on") {
    setFlashnCookie(reply, "You must agree to the terms to singn up.");
    return await reply.redirect("/signup");
  }

  const usernameFailures = checkUsername(requestData.email);
  if (usernameFailures.length > 0) {
    const formattedErrors = usernameFailures.join("<br>");
    setFlashnCookie(reply, formattedErrors);
    return await reply.redirect("/signup");
  }

  const passwordFailures = checkComplexity(requestData.password);
  if (passwordFailures.length > 0) {
    const passwordFormattedErrors = passwordFailures.join("<br>");
    setFlashnCookie(reply, passwordFormattedErrors);
    return await reply.redirect("/signup");
  }

  const db = await connect(USERS_DB);
  const userRepository = new sqliteUserRepository(db);

  const hashedPassword = await hashPassword(requestData.password);

  try {
    const newUser = {
      ...requestData,
      id: 0,
      agreeToTerms: true,
      hashedPassword,
    };
    const user = await userRepository.create(newUser);

    const sessions = new SqlliteSession(db);
    const sessionId = await sessions.create(user.id);
    setSessionCookie(reply, sessionId);

    return await reply.redirect("/welcome");
  } catch (error) {
    setFlashnCookie(reply, "Account already exists.");
    return await reply.redirect("/signup");
  }

  //return await reply.header("Content-Type", "text/html").send(rendered);
});

server.get("/signin", async (request, reply) => {
  const serverMessage = readFlashCookie(request);
  const rendered = templates.render("signin.njk", {
    server_msg: serverMessage,
    environment,
  });
  return await reply.header("Content-Type", "text/html").send(rendered);
});

server.post("/account/signin", async (request, reply) => {
  let requestLoginData: accountLoginRequest;
  try {
    requestLoginData = accountLoginRequestSchema.parse(request.body);
  } catch (err) {
    setFlashnCookie(reply, "There was an error processing your request.");
    return await reply.redirect("/signup");
  }

  const db = await connect(USERS_DB);
  const userRepository = new sqliteUserRepository(db);

  try {
    const user = await userRepository.findByEmail(requestLoginData.email);
    if (user === undefined) {
      setFlashnCookie(reply, "Invalid login credentials.");
      return await reply.redirect("/signin");
    }

    const passwordMatch = await comparePassword(
      requestLoginData.password,
      user.hashedPassword
    );

    if (!passwordMatch) {
      setFlashnCookie(reply, "Invalid login credentials.");
      return await reply.redirect("/signin");
    }

    const sessions = new SqlliteSession(db);
    const sessionId = await sessions.create(user.id);
    setSessionCookie(reply, sessionId);

    return await reply.redirect("/welcome");
  } catch (error) {
    setFlashnCookie(reply, "Invalid login credentials.");
    return await reply.redirect("/signin");
  }
});

server.get("/welcome", async (request, reply) => {
  const sessionId = readSessionCookie(request);
  if (sessionId === undefined) {
    setFlashnCookie(reply, "Please sign in to continue.");
    return await reply.redirect("/signin");
  }
  const db = await connect(USERS_DB);
  const sessions = new SqlliteSession(db);
  const user = await sessions.get(sessionId);
  if (user === undefined) {
    setFlashnCookie(
      reply,
      "Your session has expired. Please sign in to continue."
    );
    return await reply.redirect("/signin");
  }
  const rendered = templates.render("welcome.njk", {
    email: user?.email,
    environment,
  });
  return await reply.header("Content-Type", "text/html").send(rendered);
});

const start = async (): Promise<void> => {
  try {
    const db = await connect(USERS_DB);
    newDb(db);
    await server.listen({ port: Number(process.env.PORT || 8088) });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
