import { APIAllowedMentionsSend, APIApplicationCommand, APIApplicationCommandOption, APIEmbed, MessageFlags } from "discord-api-types/v8";
import { DiscordInteraction } from "./";
export declare type InteractionHandler = (interaction: DiscordInteraction) => void;
export interface RegisteredCommand {
    handler: InteractionHandler;
    command: APIApplicationCommand;
}
export interface APICreateCommandData extends CommandData {
    options?: APIApplicationCommandOption[];
}
export interface CommandData {
    name: string;
    description: string;
}
export interface APIInteractionApplicationCommandCallbackData {
    tts?: boolean;
    content: string;
    embeds?: APIEmbed[];
    allowed_mentions?: APIAllowedMentionsSend;
    flags?: MessageFlags;
}
export interface APIInteractionFollowupCallbackData {
    content?: string;
    username?: string;
    avatar_uri?: string;
    tts?: boolean;
    file?: any;
    embeds?: APIEmbed[];
    allowed_mentions?: APIAllowedMentionsSend;
    flags?: MessageFlags;
}
