import { A2A_PROTOCOL_VERSION, type AgentCard } from "@a2a-js/sdk";
import { functionAdapter } from "@web-native-agent/adapter-function";
import { createAgentGateway, type AgentGateway } from "@web-native-agent/server";
import express, { type Request, type Response } from "express";
import { createAirCartAgent } from "./agent.js";
import { getStatus, setStatus, type AirCartStatus } from "./status.js";

export function buildAirCartCard(publicOrigin: string): AgentCard {
  const origin = publicOrigin.replace(/\/$/, "");
  return {
    name: "AirCart Agent",
    description:
      "AirCart assistant for tademehl.com. Explains what AirCart is doing and how to connect a company agent to the website.",
    supportedInterfaces: [
      {
        url: `${origin}/a2a/v1`,
        protocolBinding: "HTTP+JSON",
        tenant: "",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    provider: {
      organization: "AirCart / Tade Mehl",
      url: origin.includes("tademehl.com") ? "https://tademehl.com" : origin,
    },
    version: "1.0.0",
    documentationUrl: `${origin}/agent`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "aircart-status",
        name: "AirCart status and guidance",
        description:
          "Answers what AirCart is doing right now and how to install or connect an agent on the website.",
        tags: ["aircart", "status", "website-agent", "a2a"],
        examples: [
          "What is AirCart doing right now?",
          "How do I add this agent to tademehl.com?",
          "What should I tell ChatGPT?",
        ],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["text/plain", "application/json"],
        securityRequirements: [],
      },
    ],
    signatures: [],
  };
}

function renderAgentPage(origin: string, status: AirCartStatus): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AirCart Agent</title>
  <link rel="alternate" type="application/json" href="/.well-known/agent-card.json" />
  <style>
    :root { color-scheme: light; --ink:#14213d; --muted:#4a5568; --bg:#f7f3ea; --accent:#0f6e56; }
    body { margin:0; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, serif; background:
      radial-gradient(circle at top left, #e7f2ee, transparent 40%),
      linear-gradient(160deg, #f7f3ea, #efe7d8); color:var(--ink); }
    main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); line-height:1.1; margin:0 0 0.75rem; }
    p, li { color: var(--muted); line-height:1.55; }
    .now { background:#0f6e56; color:#f7f3ea; padding:1rem 1.1rem; border-radius:0.75rem; margin:1.5rem 0; }
    .now strong { display:block; font-size:0.85rem; letter-spacing:0.04em; text-transform:uppercase; opacity:0.85; margin-bottom:0.35rem; }
    code, a { color: var(--accent); }
    ul { padding-left: 1.1rem; }
  </style>
</head>
<body>
  <main>
    <h1>AirCart Agent</h1>
    <p>${status.summary}</p>
    <div class="now">
      <strong>Right now</strong>
      ${status.nowDoing}
    </div>
    <p><strong>Focus</strong></p>
    <ul>${status.focus.map((item) => `<li>${item}</li>`).join("")}</ul>
    <p><strong>Next</strong></p>
    <ul>${status.nextUp.map((item) => `<li>${item}</li>`).join("")}</ul>
    <p>Machine discovery: <a href="/.well-known/agent-card.json"><code>/.well-known/agent-card.json</code></a></p>
    <p>Live JSON status: <a href="/agent/status.json"><code>/agent/status.json</code></a></p>
    <p>A2A endpoint: <code>${origin}/a2a/v1</code></p>
    <p>Updated ${status.updatedAt}</p>
  </main>
</body>
</html>`;
}

export function createAirCartApp(options: { publicOrigin: string }): AgentGateway {
  const card = buildAirCartCard(options.publicOrigin);
  const gateway = createAgentGateway({
    card,
    adapter: functionAdapter(createAirCartAgent(), { name: "aircart" }),
    publicOrigin: options.publicOrigin,
    includeDocsPage: false,
  });

  gateway.app.use(express.json({ limit: "32kb" }));

  gateway.app.get("/agent", (_req: Request, res: Response) => {
    res.type("html").send(renderAgentPage(options.publicOrigin.replace(/\/$/, ""), getStatus()));
  });

  gateway.app.get("/agent/status.json", (_req: Request, res: Response) => {
    res.json(getStatus());
  });

  gateway.app.post("/agent/status", (req: Request, res: Response) => {
    const token = process.env.STATUS_UPDATE_TOKEN;
    if (token && req.header("x-status-token") !== token) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = (req.body ?? {}) as Partial<AirCartStatus>;
    res.json(setStatus(body));
  });

  return gateway;
}
