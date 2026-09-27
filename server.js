import express from "express";
import { GoogleGenAI } from "@google/genai";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function createServer() {
  const server = new McpServer({
    name: "gemini-image-mcp",
    version: "1.0.0",
  });

  server.tool(
    "generate_image",
    "Generate an image from a text prompt using Google Gemini's image model. Returns the image as base64 PNG data.",
    {
      prompt: z.string().describe("Description of the image to generate"),
    },
    async ({ prompt }) => {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: prompt,
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p) => p.inlineData);
        const textPart = parts.find((p) => p.text);

        if (!imagePart) {
          return {
            content: [
              {
                type: "text",
                text: "No image was returned. Model said: " + (textPart?.text || "no details"),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "image",
              data: imagePart.inlineData.data,
              mimeType: imagePart.inlineData.mimeType || "image/png",
            },
            {
              type: "text",
              text: textPart?.text || "Image generated successfully.",
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: "Error generating image: " + (err?.message || String(err)),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/", (req, res) => {
  res.send("Gemini Image MCP server is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
