import Discord, { Snowflake } from "discord.js";
import { APIApplicationCommand, APIApplicationCommandInteractionDataOption, APIMessage, MessageType, APIInteraction, APIInteractionResponseType, InteractionType, MessageFlags, APIInteractionApplicationCommandCallbackData, RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types";
export declare class DiscordInteraction {
    client: Discord.Client;
    interactions: InteractionClient;
    id: Snowflake;
    type: InteractionType;
    guild: Discord.Guild;
    channel: Discord.TextChannel;
    member: Discord.GuildMember;
    token: string;
    commandId: Snowflake;
    commandName?: string;
    _options?: APIApplicationCommandInteractionDataOption[];
    private acknowledged;
    private editableInitialResponse;
    deleted: boolean;
    constructor(client: Discord.Client, interactions: InteractionClient, data: APIInteraction, guild: Discord.Guild, member: Discord.GuildMember, channel: Discord.TextChannel);
    get options(): any;
    acknowledge(source: boolean): Promise<any>;
    replyChannel(source: boolean, data: APIInteractionApplicationCommandCallbackData): Promise<any>;
    reply(source: boolean, content: string): Promise<any>;
    whisper(source: boolean, content: string): Promise<any>;
    private ensureResponseVisible;
    edit(content: string): Promise<this>;
    delete(): Promise<this>;
    createFollowupRaw(data: APIInteractionApplicationCommandCallbackData): Promise<DiscordFollowupMessage>;
    followupReply(content: string): Promise<DiscordFollowupMessage>;
    followupWhisper(content: string): Promise<DiscordFollowupMessage>;
    static convertInteraction(client: Discord.Client, interactions: InteractionClient, data: APIInteraction): Promise<DiscordInteraction>;
}
declare class DiscordFollowupMessage {
    client: Discord.Client;
    interactions: InteractionClient;
    interaction: DiscordInteraction;
    id: Snowflake;
    type: MessageType;
    content: String;
    flags?: MessageFlags;
    webhook_id?: Snowflake;
    channel: Discord.TextChannel;
    author: Discord.User;
    deleted: boolean;
    constructor(client: Discord.Client, interaction: DiscordInteraction, data: APIMessage, channel: Discord.TextChannel, author: Discord.User);
    private checkInteraction;
    private patch;
    edit(content: string): Promise<this>;
    delete(): Promise<this>;
    static construct(client: Discord.Client, interaction: DiscordInteraction, data: APIMessage): DiscordFollowupMessage;
}
export declare class InteractionClient {
    client: Discord.Client;
    constructor(client: Discord.Client);
    commandsBase(guildId: Snowflake | undefined, input?: any): any;
    createApplicationCommand(guildId: Snowflake | undefined, data: RESTPostAPIApplicationCommandsJSONBody): Promise<APIApplicationCommand>;
    ackRawInteraction(id: string, token: string, type: APIInteractionResponseType, callbackData?: APIInteractionApplicationCommandCallbackData): Promise<any>;
    ackInteraction(interaction: DiscordInteraction, replyType: APIInteractionResponseType, callbackData?: APIInteractionApplicationCommandCallbackData): Promise<any>;
    replyInteraction(interaction: DiscordInteraction, replyType: APIInteractionResponseType, message: string): Promise<any>;
    getApplicationCommands(guildId?: Snowflake): Promise<APIApplicationCommand[]>;
    deleteCommand(guildId: Snowflake | undefined, commandId: Snowflake): Promise<any>;
    followupBase(interaction: DiscordInteraction): any;
    createFollowupInteraction(interaction: DiscordInteraction, data: APIInteractionApplicationCommandCallbackData): Promise<DiscordFollowupMessage>;
    editInteractionResponse(interaction: DiscordInteraction, content: string, messageId?: string): Promise<any>;
    deleteInteractionResponse(interaction: DiscordInteraction, messageId?: string): Promise<any>;
}
export {};
