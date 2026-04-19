import { signChatToken } from "../shared/chat-token.js";
const clientId = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm";
const agentId = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0";
process.stdout.write(signChatToken(clientId, agentId));
