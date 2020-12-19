import { APIApplicationCommand, MessageFlags, RESTPostAPIWebhookWithTokenJSONBody } from "discord-api-types/v8"
import { DiscordInteraction } from "./interactions"

export type InteractionHandler = (interaction: DiscordInteraction) => void

export interface RegisteredCommand {
    handler: InteractionHandler
    command: APIApplicationCommand
}

export interface CommandData {
    name: string
    description: string
}

export type APIInteractionFollowupCallbackData = RESTPostAPIWebhookWithTokenJSONBody & {
    flags?: MessageFlags
}
