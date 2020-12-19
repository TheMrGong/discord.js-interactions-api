import Discord, { Snowflake } from "discord.js"
import {
    APIApplicationCommand,
    APIApplicationCommandInteractionDataOption,
    APIMessage,
    MessageType,
    APIInteraction,
    APIInteractionResponseType,
    GatewayDispatchEvents,
    InteractionType,
    MessageFlags,
    APIInteractionApplicationCommandCallbackData,
    RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types"
import { APIInteractionFollowupCallbackData, InteractionHandler, RegisteredCommand } from "./types"

const noop = () => {}
//@ts-ignore
const api: (client) => any = (client) => client.api

export class DiscordInteraction {
    client: Discord.Client
    interactions: InteractionClient

    id: Snowflake
    type: InteractionType
    guild: Discord.Guild
    channel: Discord.TextChannel
    member: Discord.GuildMember
    token: string

    commandId: Snowflake
    _options?: APIApplicationCommandInteractionDataOption[]

    private acknowledged = false
    private editableInitialResponse = false
    deleted = false

    constructor(
        client: Discord.Client,
        interactions: InteractionClient,
        data: APIInteraction,
        guild: Discord.Guild,
        member: Discord.GuildMember,
        channel: Discord.TextChannel
    ) {
        this.client = client
        this.interactions = interactions
        this.id = data.id
        this.type = data.type
        this.token = data.token

        this._options = data.data?.options
        this.commandId = data.data?.id || ""
        this.guild = guild
        this.channel = channel
        this.member = member
    }

    get options(): any {
        return buildOptionsPath(this)
    }

    async acknowledge(source: boolean) {
        if (this.acknowledged) {
            throw new Error("This interaction is already acknowledged")
        }
        this.acknowledged = true
        return this.interactions.ackInteraction(
            this,
            source ? APIInteractionResponseType.AcknowledgeWithSource : APIInteractionResponseType.Acknowledge
        )
    }

    async replyChannel(source: boolean, data: APIInteractionApplicationCommandCallbackData) {
        if (this.acknowledged) {
            throw new Error("This interaction is already acknowledged")
        }
        this.acknowledged = true
        if (!data.flags || (data.flags & MessageFlags.EPHEMERAL) === 0) {
            this.editableInitialResponse = true
        }
        return this.interactions.ackInteraction(
            this,
            source ? APIInteractionResponseType.ChannelMessageWithSource : APIInteractionResponseType.ChannelMessage,
            data
        )
    }

    async reply(source: boolean, content: string) {
        return this.replyChannel(source, {
            content,
        })
    }

    async whisper(source: boolean, content: string) {
        return this.replyChannel(source, {
            content,
            flags: MessageFlags.EPHEMERAL,
        })
    }

    private ensureResponseVisible() {
        if (!this.acknowledged) {
            throw new Error(`This interaction has yet to be acknowledged`)
        }
        if (!this.editableInitialResponse) {
            throw new Error(`Cannot modify inital response, it was either ephemeral or there was no sent message`)
        }
        if (this.deleted) {
            throw new Error(`Initial response was deleted, cannot be modified`)
        }
    }

    async edit(content: string) {
        this.ensureResponseVisible()
        await this.interactions.editInteractionResponse(this, content)

        return this
    }

    async delete() {
        this.ensureResponseVisible()
        await this.interactions.deleteInteractionResponse(this)
        this.deleted = true

        return this
    }

    async createFollowupRaw(data: APIInteractionFollowupCallbackData) {
        return this.interactions.createFollowupInteraction(this, data)
    }

    async followupReply(content: string) {
        return this.createFollowupRaw({
            content,
        })
    }

    async followupWhisper(content: string) {
        return this.createFollowupRaw({
            content,
            flags: MessageFlags.EPHEMERAL,
        })
    }

    static async convertInteraction(client: Discord.Client, interactions: InteractionClient, data: APIInteraction) {
        const guild = await client.guilds.fetch(data.guild_id)
        const member = new Discord.GuildMember(client, data.member, guild)
        const channel = guild.channels.cache.get(data.channel_id) as Discord.TextChannel
        return new DiscordInteraction(client, interactions, data, guild, member, channel)
    }
}

class DiscordFollowupMessage {
    client: Discord.Client
    interactions: InteractionClient
    interaction: DiscordInteraction

    id!: Snowflake
    type!: MessageType
    content!: String
    flags?: MessageFlags
    webhook_id?: Snowflake

    channel: Discord.TextChannel
    author: Discord.User

    deleted = false

    constructor(
        client: Discord.Client,
        interaction: DiscordInteraction,
        data: APIMessage,
        channel: Discord.TextChannel,
        author: Discord.User
    ) {
        this.patch(data)
        this.client = client
        this.interactions = interaction.interactions
        this.interaction = interaction

        this.channel = channel
        this.author = author
    }

    private checkInteraction() {
        if (this.flags && (this.flags & MessageFlags.EPHEMERAL) !== 0) {
            throw new Error(`Cannot modify ephemeral followup message`)
        }
        if (this.deleted) {
            throw new Error(`Cannot interact with deleted followup message`)
        }
    }

    private patch(data: APIMessage) {
        this.id = data.id
        this.type = data.type
        this.content = data.content
        this.flags = data.flags
        this.webhook_id = data.webhook_id
    }

    async edit(content: string) {
        this.checkInteraction()

        const edited = (await this.interactions.editInteractionResponse(
            this.interaction,
            content,
            this.id
        )) as APIMessage
        this.patch(edited)
        return this
    }

    async delete() {
        this.checkInteraction()

        await this.interactions.deleteInteractionResponse(this.interaction, this.id)

        this.deleted = true
        return this
    }

    static construct(client: Discord.Client, interaction: DiscordInteraction, data: APIMessage) {
        const author = new Discord.User(client, data.author)
        const channel = interaction.guild.channels.resolve(data.channel_id)
        if (!(channel instanceof Discord.TextChannel)) {
            throw new Error(`Channel not found ${data.channel_id}`)
        }
        return new DiscordFollowupMessage(client, interaction, data, channel, author)
    }
}

class CommandManager {
    interactions: InteractionClient
    registered: {
        [id: string]: RegisteredCommand
    } = {}

    constructor(interactions: InteractionClient) {
        this.interactions = interactions
        this.interactions.client.on("raw", (event) => {
            if (event.t !== GatewayDispatchEvents.InteractionCreate) {
                return
            }
            const rawInteraction = event.d as APIInteraction
            if (rawInteraction.type !== InteractionType.ApplicationCommand || !rawInteraction.data) {
                return
            }

            const cmdData = this.registered[rawInteraction.data.id]
            if (cmdData) {
                try {
                    DiscordInteraction.convertInteraction(interactions.client, this.interactions, rawInteraction)
                        .then(cmdData.handler)
                        .catch((e) => {
                            console.error(`Failed to handle interaction`)
                            console.error(e)
                        })
                } catch (e) {
                    console.error(
                        `Uncaught error occurred while handling interaction for command ${cmdData.command.name}`
                    )
                    console.error(e)
                }
            } else {
                const handler = (type: string) => {
                    console.warn(
                        `User ${rawInteraction.member.user.username}#${rawInteraction.member.user.discriminator}(${rawInteraction.member.user.id}) attempted to use ${type} unregistered command '${rawInteraction.data?.name}'`
                    )
                    this.interactions.ackRawInteraction(
                        rawInteraction.id,
                        rawInteraction.token,
                        APIInteractionResponseType.ChannelMessage,
                        {
                            content: `The command you tried to use no longer exists`,
                            flags: MessageFlags.EPHEMERAL,
                        }
                    )
                }
                this.interactions
                    .deleteCommand(rawInteraction.guild_id, rawInteraction.data.id)
                    .then(() => handler(`guild(${rawInteraction.guild_id})`))
                    .catch((e) => {
                        this.interactions
                            .deleteCommand(undefined, rawInteraction.data?.id || "")
                            .then(() => handler(`global`))
                            .catch((e) => {
                                console.warn(
                                    `Failed to remove unregistered command ${rawInteraction.data?.name}, wasn't either a global or guild command`
                                )
                            })
                    })
            }
        })
    }

    private async _createCommand(
        guildId: Snowflake | undefined,
        data: RESTPostAPIApplicationCommandsJSONBody,
        handler: InteractionHandler
    ) {
        const command = await this.interactions.createApplicationCommand(guildId, data)

        this.registered[command.id] = {
            command,
            handler,
        }
    }

    async createGuildCommand(
        guildId: Snowflake,
        data: RESTPostAPIApplicationCommandsJSONBody,
        handler: InteractionHandler
    ) {
        return this._createCommand(guildId, data, handler)
    }

    async createGlobalCommand(data: RESTPostAPIApplicationCommandsJSONBody, handler: InteractionHandler) {
        return this._createCommand(undefined, data, handler)
    }

    async cleanupUnreferencedGlobalCommands() {
        for (const command of await this.interactions.getApplicationCommands()) {
            if (!this.registered[command.id]) {
                console.info(`Deleting global command '${command.name}' that was no longer registered`)
                console.log(
                    JSON.stringify(
                        await this.interactions.deleteCommand(undefined, command.id).catch((error) => {
                            return { e: error }
                        })
                    )
                )
            }
        }
    }
}

export class InteractionClient {
    client: Discord.Client
    commands: CommandManager

    constructor(client: Discord.Client) {
        this.client = client
        this.commands = new CommandManager(this)
    }

    commandsBase(guildId: Snowflake | undefined, input?: any) {
        const base = api(this.client).applications(this.client.user?.id)
        if (guildId) {
            base.guilds(guildId)
        }
        return base.commands(input)
    }

    async createApplicationCommand(guildId: Snowflake | undefined, data: RESTPostAPIApplicationCommandsJSONBody) {
        return (await this.commandsBase(guildId).post({ data })) as APIApplicationCommand
    }

    async ackRawInteraction(
        id: string,
        token: string,
        type: APIInteractionResponseType,
        callbackData?: APIInteractionApplicationCommandCallbackData
    ) {
        const data = {
            type,
            data: callbackData,
        }
        return api(this.client).interactions(id)[token].callback().post({ data })
    }

    async ackInteraction(
        interaction: DiscordInteraction,
        replyType: APIInteractionResponseType,
        callbackData?: APIInteractionApplicationCommandCallbackData
    ) {
        return this.ackRawInteraction(interaction.id, interaction.token, replyType, callbackData)
    }

    async replyInteraction(interaction: DiscordInteraction, replyType: APIInteractionResponseType, message: string) {
        return this.ackInteraction(interaction, replyType, {
            content: message,
        })
    }

    async getApplicationCommands(guildId?: Snowflake) {
        const commands = (await this.commandsBase(guildId).get()) as APIApplicationCommand[]
        return commands
    }

    async deleteCommand(guildId: Snowflake | undefined, commandId: Snowflake) {
        return this.commandsBase(guildId, commandId).delete()
    }

    // followups

    followupBase(interaction: DiscordInteraction) {
        return api(this.client).webhooks(this.client.user?.id)[interaction.token]
    }

    async createFollowupInteraction(interaction: DiscordInteraction, data: APIInteractionFollowupCallbackData) {
        const response = (await this.followupBase(interaction).post({ data })) as APIMessage

        return DiscordFollowupMessage.construct(this.client, interaction, response)
    }

    async editInteractionResponse(interaction: DiscordInteraction, content: string, messageId = "@original") {
        const data = {
            content,
        }
        return this.followupBase(interaction).messages[messageId].patch({ data })
    }

    async deleteInteractionResponse(interaction: DiscordInteraction, messageId = "@original") {
        return this.followupBase(interaction).messages[messageId].delete()
    }
}

function buildOptionCloner(interaction: DiscordInteraction, path: string) {
    const handler = {
        get(_: any, name: string): any {
            let clonedPath = path
            if (clonedPath) {
                clonedPath += "."
            }
            clonedPath += name
            return buildOptionsPath(interaction, clonedPath)
        },
        apply(): any {
            return buildOptionsPath(interaction, path)
        },
    }

    return new Proxy(noop, handler)
}

function buildOptionsPath(interaction: DiscordInteraction, path = "") {
    const handler = {
        get(_: any, name: string): any {
            if (name === "clone") {
                return buildOptionCloner(interaction, path)
            }
            let newPath = path
            if (newPath) {
                newPath += "."
            }
            newPath += name

            const option = findOption(interaction._options, newPath)
            if (option && (!option.options || option.options.length === 0)) {
                return readInteractionValue(interaction, newPath)
            }
            return buildOptionsPath(interaction, newPath)
        },
        apply() {
            return readInteractionValue(interaction, path)
        },
    }

    return new Proxy(noop, handler)
}

function validatePath(interaction: DiscordInteraction, fullPath: string) {
    const cmdData = interaction.interactions.commands.registered[interaction.commandId]
    if (!cmdData) {
        throw new Error("Couldn't find interaction command")
    }
    if (!findOption(cmdData.command.options, fullPath)) {
        throw new Error(`Unable to find option at path ${fullPath}`)
    }
}

function readInteractionValue(interaction: DiscordInteraction, fullPath: string) {
    validatePath(interaction, fullPath)
    return findOption(interaction._options, fullPath)?.value
}

function findOption(options: APIApplicationCommandInteractionDataOption[] | undefined, fullPath: string) {
    if (!options) {
        return
    }
    let option: APIApplicationCommandInteractionDataOption | undefined
    for (const optionName of fullPath.split(".")) {
        if (!options) {
            return
        }

        option = options.find((option) => option.name === optionName)
        if (!option) {
            console.log(
                `Failed to find optionName ${optionName} for path ${fullPath}, available: ${options
                    .map((o) => o.name)
                    .join(", ")}`
            )
            return
        }
        options = option.options
    }
    return option
}
