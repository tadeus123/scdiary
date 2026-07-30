import {
  A2A_PROTOCOL_VERSION,
  AGENT_CARD_PATH,
  type AgentCard,
} from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  type TaskStore,
} from "@a2a-js/sdk/server";
import {
  agentCardHandler,
  restHandler,
  UserBuilder,
} from "@a2a-js/sdk/server/express";
import type { CompanyAgentAdapter } from "@web-native-agent/core";
import express, { type Express, type Request, type Response } from "express";
import { AdapterAgentExecutor } from "./executor.js";

export type CreateAgentGatewayOptions = {
  card: AgentCard;
  adapter: CompanyAgentAdapter;
  publicOrigin: string;
  a2aBasePath?: string;
  taskStore?: TaskStore;
  includeDocsPage?: boolean;
};

export type AgentGateway = {
  app: Express;
  card: AgentCard;
  requestHandler: DefaultRequestHandler;
  a2aBasePath: string;
  agentCardPath: string;
};

function withCacheHeaders(handler: express.RequestHandler): express.RequestHandler {
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    return handler(req, res, next);
  };
}

export function createAgentGateway(options: CreateAgentGatewayOptions): AgentGateway {
  const a2aBasePath = options.a2aBasePath ?? "/a2a/v1";
  const publicOrigin = options.publicOrigin.replace(/\/$/, "");

  const card: AgentCard = {
    ...options.card,
    supportedInterfaces:
      options.card.supportedInterfaces?.length > 0
        ? options.card.supportedInterfaces
        : [
            {
              url: `${publicOrigin}${a2aBasePath}`,
              protocolBinding: "HTTP+JSON",
              tenant: "",
              protocolVersion: A2A_PROTOCOL_VERSION,
            },
          ],
  };

  const taskStore = options.taskStore ?? new InMemoryTaskStore();
  const executor = new AdapterAgentExecutor(options.adapter, publicOrigin);
  const requestHandler = new DefaultRequestHandler(card, taskStore, executor);

  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(
    `/${AGENT_CARD_PATH}`,
    withCacheHeaders(agentCardHandler({ agentCardProvider: requestHandler }))
  );

  app.use(
    a2aBasePath,
    restHandler({
      requestHandler,
      userBuilder: UserBuilder.noAuthentication,
    })
  );

  if (options.includeDocsPage !== false) {
    app.get("/agent", (_req: Request, res: Response) => {
      res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${card.name}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; }
    code { background: #f4f4f4; padding: 0.1rem 0.3rem; }
    a { color: #0b5fff; }
  </style>
</head>
<body>
  <h1>${card.name}</h1>
  <p>${card.description ?? ""}</p>
  <p>Agent Card: <a href="/${AGENT_CARD_PATH}"><code>/${AGENT_CARD_PATH}</code></a></p>
  <p>A2A endpoint: <code>${a2aBasePath}</code></p>
  <p>This page is documentation only. Clients discover the agent via the Agent Card and speak A2A directly.</p>
</body>
</html>`);
    });
  }

  return {
    app,
    card,
    requestHandler,
    a2aBasePath,
    agentCardPath: AGENT_CARD_PATH,
  };
}
