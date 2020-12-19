import { APIApplicationCommand, MessageFlags, RESTPostAPIWebhookWithTokenJSONBody } from "discord-api-types/v8";
import { DiscordInteraction } from "./interactions";
export declare type InteractionHandler = (interaction: DiscordInteraction) => void;
export interface RegisteredCommand {
    handler: InteractionHandler;
    command: APIApplicationCommand;
}
export interface CommandData {
    name: string;
    description: string;
}
export declare type APIInteractionFollowupCallbackData = RESTPostAPIWebhookWithTokenJSONBody & {
    flags?: MessageFlags;
};
