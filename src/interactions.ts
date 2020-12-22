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
    commandName?: string
    optionPath: string
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

        this._options = data.data ? data.data.options : undefined
        this.commandId = data.data ? data.data.id : ""
        this.commandName = data.data ? data.data.name : undefined
        this.optionPath = buildOptionNamePath(this, this._options)

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
            throw new Error(`Cannot modify initial response, it was either ephemeral or there was no sent message`)
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

    async createFollowupRaw(data: APIInteractionApplicationCommandCallbackData) {
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
export class InteractionClient {
    client: Discord.Client

    constructor(client: Discord.Client) {
        this.client = client

        this.client.on("raw", (event) => {
            if (event.t !== GatewayDispatchEvents.InteractionCreate) {
                return
            }
            const data = event.d as APIInteraction
            if (data.type !== InteractionType.ApplicationCommand || !data.data) {
                return
            }
            DiscordInteraction.convertInteraction(this.client, this, data)
                .then((interaction) => this.client.emit("interactionCreate", interaction))
                .catch((e) => this.client.emit("error", e))
        })
    }

    commandsBase(guildId: Snowflake | undefined, input?: any) {
        const base = api(this.client).applications(this.client.user ? this.client.user.id : undefined)
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
        return api(this.client).webhooks(this.client.user ? this.client.user.id : undefined)[interaction.token]
    }

    async createFollowupInteraction(
        interaction: DiscordInteraction,
        data: APIInteractionApplicationCommandCallbackData
    ) {
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
            clonedPath += name.toLowerCase()
            return buildOptionsPath(interaction, clonedPath)
        },
        apply(): any {
            return buildOptionsPath(interaction, path)
        },
    }

    return new Proxy(noop, handler)
}

function buildOptionsPath(interaction: DiscordInteraction, path = "") {
    function getFinalPath(path: string) {
        if (interaction.optionPath && !path.startsWith(interaction.optionPath)) {
            path = interaction.optionPath + "." + path
        }
        return path
    }
    const handler = {
        get(_: any, name: string): any {
            if (name === "clone") {
                return buildOptionCloner(interaction, path)
            }
            let newPath = path
            if (newPath) {
                newPath += "."
            }
            newPath += name.toLowerCase()

            const finalPath = getFinalPath(newPath)

            const option = findOption(interaction._options, finalPath)
            if (option && (!option.options || option.options.length === 0)) {
                return readInteractionValue(interaction, finalPath)
            }
            return buildOptionsPath(interaction, newPath)
        },
        apply() {
            return readInteractionValue(interaction, getFinalPath(path))
        },
    }

    return new Proxy(noop, handler)
}

function buildOptionNamePath(interaction: DiscordInteraction, inputOptions: any, path = ""): string {
    if (inputOptions) {
        for (const { options, name } of inputOptions) {
            if (!options) {
                break
            }
            if (name) {
                path += name + "."
            }
            return buildOptionNamePath(interaction, options, path)
        }
    }

    if (path.length > 0) {
        return path.substring(0, path.length - 1)
    }
    return ""
}

function readInteractionValue(interaction: DiscordInteraction, fullPath: string) {
    const option = findOption(interaction._options, fullPath)
    return option ? option.value : undefined
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
