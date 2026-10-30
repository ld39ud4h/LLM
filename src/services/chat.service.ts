import { generateAnswer } from "./ai.service.js";
import { getGuildSystemPrompt } from "./guild-settings.service.js";
import { getHistory,getOrCreateConversation,saveMessage } from "./conversation.service.js";
import { listMemories } from "./memory.service.js";
export async function replyToUser(input:{discordUserId:string;username:string;channelId:string;guildId:string|null;prompt:string}):Promise<string>{
 const conversationId=await getOrCreateConversation(input.discordUserId,input.username,input.channelId);
 const [history,memories,systemPrompt]=await Promise.all([getHistory(conversationId),listMemories(input.discordUserId),getGuildSystemPrompt(input.guildId)]);
 const answer=await generateAnswer(history,input.prompt,memories,systemPrompt);
 await saveMessage(conversationId,"user",input.prompt);await saveMessage(conversationId,"model",answer);return answer;
}
